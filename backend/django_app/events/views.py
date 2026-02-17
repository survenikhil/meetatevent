from datetime import datetime, timedelta
from urllib.parse import quote

from django.db.models import Q
from django.utils.decorators import method_decorator
from django.contrib.auth import logout as django_logout
from django.views.decorators.csrf import ensure_csrf_cookie
import os
import requests
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from .match_service import can_message_profiles, schedule_profile_match
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Message, MessageThread, Meetup, MeetupInterest, Profile, ProfileMatch
from .serializers import (
    MessageSerializer,
    MessageThreadSerializer,
    MeetupSerializer,
    ProfileSerializer,
)


def _request_profile(request):
    if request.user.is_authenticated:
        return getattr(request.user, 'event_profile', None)
    return None


def _require_human_verified(request):
    return


def _overlapping_meetups_queryset(meetup_date, meetup_time):
    if not meetup_date or not meetup_time:
        return Meetup.objects.none()
    start_dt = datetime.combine(meetup_date, meetup_time)
    window_start = (start_dt - timedelta(minutes=30)).time()
    window_end = (start_dt + timedelta(minutes=30)).time()
    return Meetup.objects.filter(
        meetup_date=meetup_date,
        meetup_time__isnull=False,
        meetup_time__gte=window_start,
        meetup_time__lte=window_end,
    )


class ProfileViewSet(viewsets.ModelViewSet):
    queryset = Profile.objects.all().order_by('-created_at')
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        request_profile = _request_profile(self.request)
        if not request_profile:
            return Profile.objects.none()
        return Profile.objects.filter(id=request_profile.id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def perform_create(self, serializer):
        if Profile.objects.count() >= 100:
            raise ValidationError('Profile limit reached (100).')
        profile = serializer.save()
        if self.request.user.is_authenticated and profile.user_id is None:
            existing = Profile.objects.filter(user=self.request.user).exclude(id=profile.id).first()
            if existing is None:
                profile.user = self.request.user
                profile.save(update_fields=['user'])
        schedule_profile_match(profile)

    @action(detail=True, methods=['get'])
    def matches(self, request, pk=None):
        profile = self.get_object()
        request_profile = _request_profile(request)
        if not request_profile or request_profile.id != profile.id:
            raise PermissionDenied('Not allowed')
        min_score = int(request.query_params.get('min_score', 60))
        matches = (
            ProfileMatch.objects.filter(source_profile=profile, match_score__gte=min_score)
            .select_related('target_profile')
            .order_by('-match_score')
        )
        payload = []
        for m in matches:
            target = m.target_profile
            payload.append(
                {
                    'profile_id': target.id,
                    'tag': target.tag,
                    'is_anonymous': target.is_anonymous,
                    'linkedin_url': target.linkedin_url,
                    'pinned_location': target.pinned_location,
                    'profile_pic_url': target.profile_pic_url,
                    'profile_pic_uploaded_url': request.build_absolute_uri(target.profile_pic.url) if target.profile_pic else '',
                    'pitch_text': target.pitch_text if can_message_profiles(profile, target) else '',
                    'match_score': m.match_score,
                    'reasoning': m.reasoning,
                }
            )
        return Response(payload)


class AuthMeView(APIView):
    permission_classes = [AllowAny]
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        frontend_origin = request.headers.get('Origin') or 'http://localhost:5173'
        encoded_origin = quote(frontend_origin, safe='')
        login_url = f'/accounts/google/login/?process=login&prompt=select_account&next={encoded_origin}'
        logout_url = f'/accounts/logout/?next={encoded_origin}'

        if not request.user.is_authenticated:
            return Response(
                {
                    'authenticated': False,
                    'login_url': login_url,
                    'human_verified': bool(request.session.get('human_verified', False)),
                }
            )

        profile = getattr(request.user, 'event_profile', None)
        return Response(
            {
                'authenticated': True,
                'email': request.user.email,
                'name': request.user.get_full_name() or request.user.username,
                'profile_id': profile.id if profile else None,
                'login_url': login_url,
                'logout_url': logout_url,
                'human_verified': bool(request.session.get('human_verified', False)),
            }
        )


class HumanVerifyView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        # If no secret is configured (local/dev), allow verification to proceed.
        secret = os.environ.get('TURNSTILE_SECRET_KEY', '').strip()
        token = (request.data.get('token') or '').strip()

        if not secret:
            request.session['human_verified'] = True
            request.session.modified = True
            return Response({'success': True, 'mode': 'dev-bypass'})

        if not token:
            return Response({'success': False, 'error': 'token is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            verify_response = requests.post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                data={
                    'secret': secret,
                    'response': token,
                    'remoteip': request.META.get('REMOTE_ADDR', ''),
                },
                timeout=10,
            )
            verify_response.raise_for_status()
            payload = verify_response.json()
        except Exception:
            return Response({'success': False, 'error': 'captcha verification failed'}, status=status.HTTP_502_BAD_GATEWAY)

        if not payload.get('success'):
            return Response({'success': False, 'error': 'captcha verification failed'}, status=status.HTTP_400_BAD_REQUEST)

        request.session['human_verified'] = True
        request.session.modified = True
        return Response({'success': True, 'mode': 'turnstile'})


class LogoutView(APIView):
    def post(self, request):
        if request.user.is_authenticated:
            django_logout(request)
        return Response({'success': True})


class MeetupViewSet(viewsets.ModelViewSet):
    queryset = Meetup.objects.all().order_by('-created_at')
    serializer_class = MeetupSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        request_profile = _request_profile(self.request)
        if not request_profile:
            raise PermissionDenied('Not allowed')
        serializer.save(organizer=request_profile)

    @action(detail=False, methods=['get'])
    def slot_check(self, request):
        meetup_date = request.query_params.get('meetup_date')
        meetup_time = request.query_params.get('meetup_time')
        if not meetup_date or not meetup_time:
            return Response({'error': 'meetup_date and meetup_time are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed_date = datetime.strptime(meetup_date, '%Y-%m-%d').date()
            parsed_time = datetime.strptime(meetup_time, '%H:%M').time()
        except ValueError:
            return Response({'error': 'Invalid meetup_date or meetup_time format'}, status=status.HTTP_400_BAD_REQUEST)

        overlap_count = _overlapping_meetups_queryset(parsed_date, parsed_time).count()
        return Response({'overlap_count': overlap_count, 'warn': overlap_count > 1})

    @action(detail=True, methods=['post'])
    def up_for_it(self, request, pk=None):
        meetup = self.get_object()
        profile = _request_profile(request)
        if not profile:
            return Response({'error': 'not allowed'}, status=status.HTTP_403_FORBIDDEN)

        interest, created = MeetupInterest.objects.get_or_create(meetup=meetup, profile=profile)
        if not created:
            interest.delete()
            return Response({'status': 'removed', 'up_for_it_count': meetup.interests.count()})

        if meetup.meetup_date and meetup.meetup_time:
            overlapping_ids = _overlapping_meetups_queryset(meetup.meetup_date, meetup.meetup_time).exclude(id=meetup.id).values_list('id', flat=True)
            overlap_interest_count = MeetupInterest.objects.filter(
                profile=profile,
                meetup_id__in=overlapping_ids,
            ).count()
            if overlap_interest_count >= 2:
                interest.delete()
                return Response(
                    {'error': 'You can opt into at most 2 overlapping meetups (1 primary + 1 backup).'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        return Response({'status': 'added', 'up_for_it_count': meetup.interests.count()})

    @action(detail=False, methods=['get'])
    def my(self, request):
        profile = _request_profile(request)
        if not profile:
            return Response({'error': 'not allowed'}, status=status.HTTP_403_FORBIDDEN)

        meetups = Meetup.objects.filter(Q(organizer=profile) | Q(interests__profile=profile)).distinct().order_by('-created_at')
        payload = []
        for meetup in meetups:
            role = 'Organizer' if meetup.organizer_id == profile.id else 'Participant'
            payload.append({
                'id': meetup.id,
                'title': meetup.title,
                'place': meetup.place,
                'time_text': meetup.time_text,
                'meetup_date': meetup.meetup_date,
                'meetup_time': meetup.meetup_time,
                'role': role,
                'up_for_it_count': meetup.interests.count()
            })
        return Response(payload)


class MessageThreadViewSet(viewsets.ModelViewSet):
    queryset = MessageThread.objects.all().order_by('-updated_at')
    serializer_class = MessageThreadSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        request_profile = _request_profile(request)
        if not request_profile:
            return Response({'error': 'not allowed'}, status=status.HTTP_403_FORBIDDEN)

        threads = MessageThread.objects.filter(participants__id=request_profile.id).distinct().order_by('-updated_at')
        data = []
        for thread in threads:
            last_message = thread.messages.order_by('-created_at').first()
            participants = list(thread.participants.values('id', 'tag'))
            data.append({
                'id': thread.id,
                'participants': participants,
                'last_message': last_message.body if last_message else '',
                'updated_at': thread.updated_at,
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def poll(self, request):
        request_profile = _request_profile(request)
        if not request_profile:
            return Response({'error': 'not allowed'}, status=status.HTTP_403_FORBIDDEN)
        threads = MessageThread.objects.filter(participants__id=request_profile.id).distinct().order_by('-updated_at')
        data = []
        for thread in threads:
            last_message = thread.messages.order_by('-created_at').first()
            participants = list(thread.participants.values('id', 'tag'))
            data.append({
                'id': thread.id,
                'participants': participants,
                'last_message': last_message.body if last_message else '',
                'updated_at': thread.updated_at,
            })
        return Response(data)

    @action(detail=False, methods=['post'])
    def start(self, request):
        request_profile = _request_profile(request)
        sender_id = request_profile.id if request_profile else None
        recipient_id = request.data.get('recipient_profile_id')
        text = request.data.get('text', '').strip()

        if not sender_id or not recipient_id or not text:
            return Response(
                {'error': 'sender_profile_id, recipient_profile_id and text are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sender = Profile.objects.get(id=sender_id)
            recipient = Profile.objects.get(id=recipient_id)
        except (Profile.DoesNotExist, ValueError):
            return Response({'error': 'profile not found'}, status=status.HTTP_404_NOT_FOUND)

        if not can_message_profiles(sender, recipient):
            return Response({'error': 'Messaging requires >70% voice match'}, status=status.HTTP_403_FORBIDDEN)

        thread = None
        candidate_threads = MessageThread.objects.filter(participants=sender).filter(participants=recipient).distinct()
        for t in candidate_threads:
            if t.participants.count() == 2:
                thread = t
                break
        if thread is None:
            thread = MessageThread.objects.create()
            thread.participants.add(sender, recipient)

        message = Message.objects.create(thread=thread, sender=sender, body=text)
        thread.save(update_fields=['updated_at'])
        channel_layer = get_channel_layer()
        if channel_layer:
            payload = {
                'thread_id': thread.id,
                'updated_at': thread.updated_at.isoformat(),
                'message': MessageSerializer(message).data,
            }
            async_to_sync(channel_layer.group_send)(f'profile_{sender.id}', {'type': 'message_event', 'data': payload})
            async_to_sync(channel_layer.group_send)(f'profile_{recipient.id}', {'type': 'message_event', 'data': payload})
        return Response({'thread_id': thread.id}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        thread = self.get_object()
        request_profile = _request_profile(request)
        sender_id = request_profile.id if request_profile else None
        text = request.data.get('text', '').strip()

        if not sender_id or not text:
            return Response({'error': 'sender_profile_id and text are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sender = Profile.objects.get(id=sender_id)
        except (Profile.DoesNotExist, ValueError):
            return Response({'error': 'sender profile not found'}, status=status.HTTP_404_NOT_FOUND)

        if not thread.participants.filter(id=sender.id).exists():
            return Response({'error': 'sender is not part of this thread'}, status=status.HTTP_403_FORBIDDEN)

        participants = list(thread.participants.all())
        if len(participants) == 2 and not can_message_profiles(participants[0], participants[1]):
            return Response({'error': 'Messaging requires >70% voice match'}, status=status.HTTP_403_FORBIDDEN)

        message = Message.objects.create(thread=thread, sender=sender, body=text)
        thread.save(update_fields=['updated_at'])
        channel_layer = get_channel_layer()
        if channel_layer:
            payload = {
                'thread_id': thread.id,
                'updated_at': thread.updated_at.isoformat(),
                'message': MessageSerializer(message).data,
            }
            for participant in thread.participants.all():
                async_to_sync(channel_layer.group_send)(
                    f'profile_{participant.id}',
                    {'type': 'message_event', 'data': payload}
                )
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        thread = self.get_object()
        request_profile = _request_profile(request)
        if not request_profile or not thread.participants.filter(id=request_profile.id).exists():
            return Response({'error': 'not allowed'}, status=status.HTTP_403_FORBIDDEN)

        messages = thread.messages.order_by('created_at')
        return Response(MessageSerializer(messages, many=True).data)
