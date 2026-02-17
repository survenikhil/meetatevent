from channels.generic.websocket import AsyncJsonWebsocketConsumer


class MessageConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if user is None or user.is_anonymous:
            await self.close()
            return

        profile = getattr(user, 'event_profile', None)
        if not profile:
            await self.close()
            return

        self.group_name = f'profile_{profile.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group_name = getattr(self, 'group_name', None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def message_event(self, event):
        payload = event.get('data', {})
        await self.send_json(payload)
