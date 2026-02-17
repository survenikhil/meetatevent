from rest_framework import serializers

from .match_service import can_message_profiles
from .models import Message, MessageThread, Meetup, MeetupInterest, Profile


class ProfileSerializer(serializers.ModelSerializer):
    profile_pic_uploaded_url = serializers.SerializerMethodField()
    pitch_text = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = '__all__'

    def get_profile_pic_uploaded_url(self, obj):
        if not obj.profile_pic:
            return ''
        request = self.context.get('request')
        url = obj.profile_pic.url
        return request.build_absolute_uri(url) if request else url

    def get_pitch_text(self, obj):
        request = self.context.get('request')
        if not request:
            return ''

        if request.user.is_authenticated:
            viewer = getattr(request.user, 'event_profile', None)
            if viewer:
                if viewer.id == obj.id:
                    return obj.pitch_text
                if can_message_profiles(viewer, obj):
                    return obj.pitch_text
                return ''

        viewer_id = request.query_params.get('viewer_profile_id')
        if viewer_id:
            try:
                viewer = Profile.objects.get(id=viewer_id)
            except (Profile.DoesNotExist, ValueError):
                return ''
            if viewer.id == obj.id:
                return obj.pitch_text
            if can_message_profiles(viewer, obj):
                return obj.pitch_text

        return ''


class MeetupSerializer(serializers.ModelSerializer):
    up_for_it_count = serializers.SerializerMethodField()

    class Meta:
        model = Meetup
        fields = '__all__'

    def get_up_for_it_count(self, obj):
        return obj.interests.count()


class MeetupInterestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeetupInterest
        fields = '__all__'


class MessageSerializer(serializers.ModelSerializer):
    sender_role = serializers.CharField(source='sender.tag', read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'thread', 'sender', 'sender_role', 'body', 'created_at']


class MessageThreadSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = MessageThread
        fields = ['id', 'event_name', 'participants', 'messages', 'created_at', 'updated_at']
