from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import AuthMeView, HumanVerifyView, LogoutView, MessageThreadViewSet, MeetupViewSet, ProfileViewSet

router = DefaultRouter()
router.register(r'profiles', ProfileViewSet)
router.register(r'meetups', MeetupViewSet)
router.register(r'message-threads', MessageThreadViewSet)

urlpatterns = [
    path('auth/me/', AuthMeView.as_view(), name='auth-me'),
    path('auth/human-verify/', HumanVerifyView.as_view(), name='human-verify'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
]
urlpatterns += router.urls
