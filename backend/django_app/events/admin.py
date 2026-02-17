from django.contrib import admin
from .models import Message, MessageThread, Meetup, MeetupInterest, Profile, ProfileMatch

admin.site.register(Profile)
admin.site.register(Meetup)
admin.site.register(MeetupInterest)
admin.site.register(MessageThread)
admin.site.register(Message)
admin.site.register(ProfileMatch)
