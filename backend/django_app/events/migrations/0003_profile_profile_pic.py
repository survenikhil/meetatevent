from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0002_profile_linkedin_url_profile_profile_pic_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='profile_pic',
            field=models.ImageField(blank=True, null=True, upload_to='profiles/'),
        ),
    ]
