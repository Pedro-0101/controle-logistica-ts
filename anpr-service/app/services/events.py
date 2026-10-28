"""Bounded, process-local wake-up feed. Clients always fetch current state."""
import asyncio
from collections import deque
from uuid import uuid4


class MonitorEvents:
    def __init__(self, capacity=1024):
        self.epoch = uuid4().hex
        self.sequence = 0
        self.entries = deque(maxlen=capacity)
        self.changed = asyncio.Event()
        self.closed = False

    @property
    def cursor(self):
        return f"{self.epoch}:{self.sequence}"

    def publish(self, camera_id):
        self.sequence += 1
        self.entries.append((self.sequence, camera_id))
        self.changed.set()

    def _read(self, cursor, camera_ids):
        try:
            epoch, value = cursor.split(":")
            position = int(value)
        except (AttributeError, ValueError):
            epoch, position = None, -1
        oldest = self.entries[0][0] if self.entries else self.sequence + 1
        reset = epoch != self.epoch or position < oldest - 1 or position > self.sequence
        ids = camera_ids() if reset else [camera for seq, camera in self.entries if seq > position]
        return {"cursor": self.cursor, "reset": reset,
                "events": [{"cameraId": camera} for camera in dict.fromkeys(ids)]}

    async def poll(self, cursor, wait_seconds, camera_ids):
        result = self._read(cursor, camera_ids)
        if result["reset"] or result["events"] or wait_seconds <= 0 or self.closed:
            return result
        # No await between read and clear: publisher runs on this same event loop.
        self.changed.clear()
        try:
            await asyncio.wait_for(self.changed.wait(), wait_seconds)
        except TimeoutError:
            pass
        return self._read(cursor, camera_ids)

    def close(self):
        self.closed = True
        self.changed.set()
