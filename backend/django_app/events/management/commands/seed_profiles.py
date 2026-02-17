from django.core.management.base import BaseCommand
from events.match_service import create_or_update_profile_matches
from events.models import Meetup, Profile


class Command(BaseCommand):
    help = 'Seed dummy profiles in Kalwa, Thane for demo.'

    def handle(self, *args, **options):
        data = [
            {
                'display_name': 'Riya Patel',
                'tag': 'Product Lead',
                'pitch_text': 'Building privacy-first copilots for customer support teams.',
                'profile_pic_url': 'https://i.pravatar.cc/200?img=47',
                'linkedin_url': 'https://www.linkedin.com/in/riya-patel-ai',
                'pinned_location': 'Hall A - AI Infra Booth',
                'is_anonymous': True,
                'location_lat': 19.1799,
                'location_lng': 72.9773
            },
            {
                'display_name': 'Arjun Mehta',
                'tag': 'Founder',
                'pitch_text': 'Looking for distribution partners in retail AI.',
                'profile_pic_url': 'https://i.pravatar.cc/200?img=12',
                'linkedin_url': 'https://www.linkedin.com/in/arjun-mehta-founder',
                'pinned_location': 'Startup Pavilion K2',
                'is_anonymous': False,
                'location_lat': 19.1842,
                'location_lng': 72.9811
            },
            {
                'display_name': 'Isha Nair',
                'tag': 'Research',
                'pitch_text': 'Working on efficient inference for edge devices.',
                'profile_pic_url': 'https://i.pravatar.cc/200?img=5',
                'linkedin_url': 'https://www.linkedin.com/in/isha-nair-ml',
                'pinned_location': 'Research Demo Corner R4',
                'is_anonymous': True,
                'location_lat': 19.1774,
                'location_lng': 72.9726
            },
            {
                'display_name': 'Sana Qureshi',
                'tag': 'Community',
                'pitch_text': 'Connecting AI builders with city partnerships.',
                'profile_pic_url': 'https://i.pravatar.cc/200?img=32',
                'linkedin_url': 'https://www.linkedin.com/in/sana-qureshi-community',
                'pinned_location': 'Community Lounge',
                'is_anonymous': False,
                'location_lat': 19.1821,
                'location_lng': 72.9759
            }
        ]

        upserted = 0
        for item in data:
            profile, _ = Profile.objects.update_or_create(
                display_name=item['display_name'],
                tag=item['tag'],
                defaults=item
            )
            create_or_update_profile_matches(profile)
            upserted += 1

        self.stdout.write(self.style.SUCCESS(f'Seeded {upserted} profiles.'))

        organizer = Profile.objects.filter(display_name='Arjun Mehta').first()
        if organizer:
            Meetup.objects.update_or_create(
                title='Founders coffee sync',
                defaults={
                    'place': 'Expo Cafe - East Wing',
                    'time_text': '11:30 AM',
                    'meetup_date': '2026-02-16',
                    'organizer': organizer,
                    'event_name': 'India AI Summit',
                },
            )
            Meetup.objects.update_or_create(
                title='Edge AI quick huddle',
                defaults={
                    'place': 'Demo Zone R4',
                    'time_text': '3:00 PM',
                    'meetup_date': '2026-02-16',
                    'organizer': organizer,
                    'event_name': 'India AI Summit',
                },
            )
