from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from pgvector.django import VectorField


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='event_profile')
    display_name = models.CharField(max_length=120)
    event_name = models.CharField(max_length=120, default='India AI Summit')
    pitch_text = models.TextField()
    pitch_audio_url = models.URLField(blank=True)
    profile_pic = models.ImageField(upload_to='profiles/', blank=True, null=True)
    profile_pic_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    pinned_location = models.CharField(max_length=180, blank=True)
    is_anonymous = models.BooleanField(default=True)
    tag = models.CharField(max_length=80, blank=True)
    location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    embedding = VectorField(dimensions=1536, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name


class Meetup(models.Model):
    title = models.CharField(max_length=160)
    place = models.CharField(max_length=160)
    time_text = models.CharField(max_length=40, blank=True)
    meetup_date = models.DateField(default=timezone.localdate)
    meetup_time = models.TimeField(null=True, blank=True)
    organizer = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='organized_meetups', null=True, blank=True)
    event_name = models.CharField(max_length=120, default='India AI Summit')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class MeetupInterest(models.Model):
    meetup = models.ForeignKey(Meetup, on_delete=models.CASCADE, related_name='interests')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='meetup_interests')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('meetup', 'profile')


class MessageThread(models.Model):
    event_name = models.CharField(max_length=120, default='India AI Summit')
    participants = models.ManyToManyField(Profile, related_name='message_threads')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Message(models.Model):
    thread = models.ForeignKey(MessageThread, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='sent_messages')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class ProfileMatch(models.Model):
    source_profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='matches_from')
    target_profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='matches_to')
    match_score = models.PositiveSmallIntegerField()
    reasoning = models.CharField(max_length=240)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('source_profile', 'target_profile')
