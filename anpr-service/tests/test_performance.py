"""Performance contracts: no camera/model/network access, deterministic work gates."""
import asyncio
import sys
import threading
import time
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import cv2
import httpx
import numpy as np
import pytest

from app.config import settings
from app.services.events import MonitorEvents
from app.services.inference import InferenceScheduler
from app.services.stats import InferenceStats
from app.routers.monitors import CameraMonitor, MonitorManager
from app.schemas import MonitorIn
from app.anpr.recognizer import PlacaRecognizer


def test_stats_windows_units_legacy_and_bounds(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("app.services.stats.time.monotonic", lambda: clock[0])
    stats = InferenceStats(max_samples=2)
    assert stats.snapshot()["count"] == 0
    for value in (.1, .2, .6):
        stats.record(value)
        stats.observe("inference", value, "camera-a")
    stats.increment("snapshots", camera_id="camera-a")
    stats.increment("snapshot_bytes", 1024, "camera-a")
    stats.queue(3, True, 68)
    clock[0] = 102
    result = stats.snapshot()
    assert result["count"] == 3 and result["avg_ms"] == 300
    assert result["durations"]["inference"] == {
        "window_count": 2, "avg_ms": 400, "min_ms": 200, "max_ms": 600,
        "p50_ms": 200, "p95_ms": 600,
    }
    assert result["cameras"]["camera-a"]["counters"]["snapshot_bytes"] == 1024
    assert result["uptime_seconds"] == 2
    assert result["queue"] == {"pending": 3, "active": 1, "workers": 1, "capacity": 68}
    for n in range(130):
        stats.increment("snapshots", camera_id=str(n))
    assert len(stats.snapshot()["cameras"]) == 128
    assert "camera-a" not in stats.snapshot()["cameras"]
    stats.reset()
    assert stats.snapshot()["count"] == 0
    assert stats.snapshot()["durations"] == {}
    assert stats._summary([n / 1000 for n in range(1, 21)])["p95_ms"] == 19


def test_events_replay_coalesce_reset_wait_cancel_and_close():
    async def run():
        events = MonitorEvents(capacity=2)
        ids = lambda: ["a", "b"]
        initial = await events.poll(None, 0, ids)
        assert initial["reset"] and initial["events"] == [{"cameraId": "a"}, {"cameraId": "b"}]
        cursor = initial["cursor"]
        events.publish("a")
        events.publish("a")
        replay = await events.poll(cursor, 0, ids)
        assert not replay["reset"] and replay["events"] == [{"cameraId": "a"}]
        events.publish("b")
        assert (await events.poll(cursor, 0, ids))["reset"]
        assert (await events.poll("other-process:4", 0, ids))["reset"]
        assert (await events.poll(events.epoch + ":999", 0, ids))["reset"]
        cursor = events.cursor
        waiting = asyncio.create_task(events.poll(cursor, 1, ids))
        await asyncio.sleep(0)
        events.publish("b")
        assert (await waiting)["events"] == [{"cameraId": "b"}]
        assert (await events.poll(events.cursor, .001, ids))["events"] == []
        pending = asyncio.create_task(events.poll(events.cursor, 1, ids))
        await asyncio.sleep(0)
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending
        pending = asyncio.create_task(events.poll(events.cursor, 1, ids))
        await asyncio.sleep(0)
        events.close()
        assert (await pending)["events"] == []
    asyncio.run(run())


def test_scheduler_all_outcomes_expiry_and_backpressure(monkeypatch, candidate):
    async def run():
        scheduler = InferenceScheduler()
        started, release = threading.Event(), threading.Event()
        def infer(image, fallback):
            if image == "block":
                started.set()
                assert release.wait(2)
                return candidate
            if image == "error":
                raise ValueError("model failure")
            return None
        monkeypatch.setattr(scheduler, "_infer", infer)
        completed = []
        callback = lambda result, error: completed.append((result, error))
        now = time.monotonic()
        scheduler.submit_monitor("expired", "unused", callback, now - 1, now - 2)
        scheduler.submit_monitor("a", "block", callback, now + 5, now)
        scheduler.start()
        try:
            for _ in range(100):
                if started.is_set():
                    break
                await asyncio.sleep(.001)
            assert started.is_set()
            assert scheduler.busy("a") and not scheduler.busy("expired")
            assert not scheduler.submit_monitor("a", "unused", callback)
            scheduler.submit_monitor("b", "unused", callback)
            scheduler.submit_monitor("b", "error", callback)
            scheduler.submit_monitor("c", "empty", callback)
            scheduler.submit_monitor("removed", "unused", callback)
            scheduler.remove_monitor("removed")
            assert not scheduler.busy("removed")
            release.set()
            for _ in range(100):
                if len(completed) == 3:
                    break
                await asyncio.sleep(.001)
            assert len(completed) == 3 and completed[1][1] is not None
            result = scheduler.stats.snapshot()
            assert result["count"] == 1
            assert result["counters"]["recognized"] == 1
            assert result["counters"]["no_plate"] == 1
            assert result["counters"]["inference_error"] == 1
            assert result["counters"]["expired_before_inference"] == 1
            assert result["counters"]["replaced"] == 1
            assert result["durations"]["inference"]["window_count"] == 3
            assert result["durations"]["queue_wait"]["window_count"] == 3
            assert result["durations"]["frame_age"]["window_count"] == 1
            assert result["queue"] == {"pending": 0, "active": 0, "workers": 1, "capacity": 68}
        finally:
            release.set()
            await scheduler.close()
        assert not scheduler.submit_monitor("a", None, callback)
    asyncio.run(run())


def test_manual_timeout_releases_pending_slot(monkeypatch):
    async def run():
        scheduler = InferenceScheduler()
        monkeypatch.setattr(settings, "inference_timeout_seconds", .001)
        try:
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc:
                await scheduler.recognize(None)  # worker deliberately not started
            assert exc.value.status_code == 504
            assert scheduler.manual_count == 0 and not scheduler.pending
        finally:
            await scheduler.close()
    asyncio.run(run())


def monitor(monkeypatch, scheduler=None):
    monkeypatch.setattr("app.routers.monitors.SnapshotClient", lambda _: SimpleNamespace(close=AsyncMock()))
    return CameraMonitor("camera-a", MonitorIn(host="test", interval_seconds=.1), scheduler)


def test_static_scene_forced_probe_motion_and_active_observation(monkeypatch):
    item = monitor(monkeypatch)
    black = np.zeros((54, 96, 3), dtype=np.uint8)
    assert item._should_infer(black, 10)
    assert not item._should_infer(black, 10.1)
    assert item._capture_delay() > .1
    assert item._should_infer(black, 12.1)  # mandatory periodic OCR even if stationary
    changed = black.copy()
    changed[20:30, 40:50] = 255
    assert item._should_infer(changed, 12.2)  # localized movement
    item.status = "candidate"
    assert item._should_infer(changed, 12.3)
    assert item._capture_delay() == .1
    item.status = "confirmed"
    assert item._should_infer(changed, 12.4)
    item.status = "waiting"
    monkeypatch.setattr(settings, "anpr_scene_filter", False)
    assert item._should_infer(changed, 12.5)
    assert item._capture_delay() == .1


def test_only_meaningful_observation_changes_emit_events(monkeypatch, candidate):
    item = monitor(monkeypatch)
    item.events = MonitorEvents()
    def accept(result, error=None):
        item.accept(result, error, item.epoch, datetime.now(UTC), time.monotonic(), b"jpeg")
    accept(None)
    accept(None)
    assert item.events.sequence == 0
    accept(candidate)
    assert item.events.sequence == 1 and item.status == "candidate"
    accept(candidate)
    assert item.events.sequence == 2 and item.status == "confirmed"
    accept(candidate)
    assert item.events.sequence == 3  # freshness refresh remains meaningful
    accept(None, ValueError("failed"))
    assert item.events.sequence == 4 and item.status == "offline"
    item.invalidate("offline")
    assert item.events.sequence == 4


def test_capture_reuses_jpeg_and_skips_download_while_busy(monkeypatch, jpeg):
    async def run():
        scheduler = InferenceScheduler()
        item = monitor(monkeypatch, scheduler)
        item.client.capture = AsyncMock(return_value=(jpeg, "unused"))
        scheduler.active_key = ("camera", item.camera_id)
        original_sleep = asyncio.sleep
        calls = 0
        async def sleep(_):
            nonlocal calls
            calls += 1
            if calls == 1:
                assert item.client.capture.await_count == 0
                scheduler.active_key = None
            else:
                item.closed = True
            await original_sleep(0)
        monkeypatch.setattr("app.routers.monitors.asyncio.sleep", sleep)
        monkeypatch.setattr("app.routers.monitors.cv2.imencode", lambda *args: pytest.fail("JPEG must not be recompressed"))
        try:
            await item._capture()
            assert item.client.capture.await_count == 1
            queued = scheduler.pending[("camera", item.camera_id)]
            item.closed = False
            queued[2](None, None)
            stats = scheduler.stats.snapshot()
            assert stats["counters"]["snapshot_bytes"] == len(jpeg)
            assert stats["counters"]["snapshots"] == 1
            assert stats["counters"]["capture_backpressure_skipped"] == 1
        finally:
            await scheduler.close()
    asyncio.run(run())


def test_text_recognition_uses_pipeline_selected_model_without_loading_detector(monkeypatch):
    class Pipeline:
        def __init__(self, **kwargs):
            pytest.fail("full pipeline should be lazy")
        def _get_ocr_model_names(self, lang, version):
            assert lang == "en" and version is None
            return "same-detector", "same-reader"
    constructor = MagicMock(return_value=SimpleNamespace(predict=lambda image: [{"rec_text": "ABC1D23", "rec_score": .94}]))
    monkeypatch.setitem(sys.modules, "paddleocr", SimpleNamespace(PaddleOCR=Pipeline, TextRecognition=constructor))
    monkeypatch.setattr(settings, "anpr_text_recognition_model", "")
    reader = PlacaRecognizer("en")
    constructor.assert_called_once_with(model_name="same-reader")
    assert reader._read_crop(np.zeros((30, 120, 3), np.uint8)) == [("ABC1D23", .94)]


def test_full_crop_fallback_reuses_selected_reader_model(monkeypatch):
    seen = {}

    class Pipeline:
        def __init__(self, **kwargs):
            seen["pipeline"] = kwargs
        def _get_ocr_model_names(self, lang, version):
            return "same-detector", "same-reader"
        def predict(self, _image):
            return [{"rec_texts": ["ABC1D23"], "rec_scores": [.9]}]

    constructor = MagicMock(return_value=SimpleNamespace(predict=lambda image: [{"rec_text": "nope", "rec_score": .1}]))
    monkeypatch.setitem(sys.modules, "paddleocr", SimpleNamespace(PaddleOCR=Pipeline, TextRecognition=constructor))
    monkeypatch.setattr(settings, "anpr_text_recognition_model", "")
    reader = PlacaRecognizer("en")
    assert ("ABC1D23", .9) in reader._read_crop(np.zeros((30, 120, 3), np.uint8))
    assert seen["pipeline"]["text_detection_model_name"] == "same-detector"
    assert seen["pipeline"]["text_recognition_model_name"] == "same-reader"


def test_two_line_crop_falls_back_and_joins_rows(monkeypatch):
    reader = object.__new__(PlacaRecognizer)
    reader._text_reader = SimpleNamespace(predict=lambda _: [{"rec_text": "ABC", "rec_score": .9}])
    reader._ocr = SimpleNamespace(predict=lambda _: [{"rec_texts": ["ABC", "1D23"], "rec_scores": [.9, .8]}])
    monkeypatch.setattr(settings, "anpr_crop_pipeline_fallback", True)
    readings = reader._read_crop(np.zeros((80, 120, 3), np.uint8))
    assert ("ABC1D23", .8) in readings
    monkeypatch.setattr(settings, "anpr_crop_pipeline_fallback", False)
    assert reader._read_crop(np.zeros((80, 120, 3), np.uint8)) == [("ABC", .9)]


def test_http_stats_and_event_contract(monkeypatch):
    from app.main import app
    async def run():
        scheduler = InferenceScheduler()
        app.state.stats = scheduler.stats
        manager = MonitorManager(scheduler)
        app.state.monitors = manager
        scheduler.stats.increment("no_plate")
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                stats = (await client.get("/stats")).json()
                assert stats["version"] == 2 and stats["counters"]["no_plate"] == 1
                initial = (await client.get("/monitor-events?wait_seconds=0")).json()
                assert initial["reset"]
                manager.events.publish("camera-a")
                response = (await client.get("/monitor-events", params={"cursor": initial["cursor"], "wait_seconds": 0})).json()
                assert response["events"] == [{"cameraId": "camera-a"}]
                assert not response["reset"]
                assert (await client.get("/monitor-events?wait_seconds=26")).status_code == 422
        finally:
            await manager.close()
            await scheduler.close()
    asyncio.run(run())
