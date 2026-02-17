from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0003_profile_profile_pic'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='pinned_location',
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.AlterField(
            model_name='meetup',
            name='time_text',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name='meetup',
            name='meetup_date',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AddField(
            model_name='meetup',
            name='meetup_time',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='meetup',
            name='organizer',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='organized_meetups', to='events.profile'),
        ),
        migrations.CreateModel(
            name='MessageThread',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_name', models.CharField(default='India AI Summit', max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('participants', models.ManyToManyField(related_name='message_threads', to='events.profile')),
            ],
        ),
        migrations.CreateModel(
            name='MeetupInterest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('meetup', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='interests', to='events.meetup')),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='meetup_interests', to='events.profile')),
            ],
            options={'unique_together': {('meetup', 'profile')}},
        ),
        migrations.CreateModel(
            name='Message',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_messages', to='events.profile')),
                ('thread', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='events.messagethread')),
            ],
        ),
    ]
