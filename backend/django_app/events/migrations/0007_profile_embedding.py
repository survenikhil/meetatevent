from django.db import migrations
from pgvector.django import VectorField


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0006_profilematch'),
    ]

    operations = [
        migrations.RunSQL('CREATE EXTENSION IF NOT EXISTS vector'),
        migrations.AddField(
            model_name='profile',
            name='embedding',
            field=VectorField(dimensions=1536, null=True, blank=True),
        ),
    ]
