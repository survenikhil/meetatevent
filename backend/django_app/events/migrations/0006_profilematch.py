from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0005_profile_user'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProfileMatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('match_score', models.PositiveSmallIntegerField()),
                ('reasoning', models.CharField(max_length=240)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches_from', to='events.profile')),
                ('target_profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches_to', to='events.profile')),
            ],
            options={'unique_together': {('source_profile', 'target_profile')}},
        ),
    ]
