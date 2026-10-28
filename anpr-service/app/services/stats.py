"""Rastreamento de tempo de inferência para reconhecimento de placas.

Armazena em memória os tempos de inferência (YOLO + PaddleOCR) para cada
imagem que teve placa reconhecida. Expõe estatísticas: média, mediana,
mínimo, máximo, p95 e contagem total.
"""
import threading
from collections import Counter, OrderedDict, deque
import time
import math


class InferenceStats:
    def __init__(self, max_samples: int = 1000) -> None:
        self._lock = threading.Lock()
        self._samples: deque[float] = deque(maxlen=max_samples)
        self._total_count = 0
        self._total_sum = 0.0
        self._max_samples = max_samples
        self._started = time.monotonic()
        self._counters = Counter()
        self._durations = {}
        self._cameras = OrderedDict()
        self._queue = {"pending": 0, "active": 0, "workers": 1, "capacity": 0}

    def observe(self, name, seconds, camera_id=None):
        """Durations are rolling windows; counters are lifetime since process/reset."""
        with self._lock:
            self._durations.setdefault(name, deque(maxlen=self._max_samples)).append(seconds)
            if camera_id is not None:
                camera = self._camera(camera_id)
                camera["durations"].setdefault(name, deque(maxlen=self._max_samples)).append(seconds)

    def increment(self, name, amount=1, camera_id=None):
        with self._lock:
            self._counters[name] += amount
            if camera_id is not None:
                self._camera(camera_id)["counters"][name] += amount

    def _camera(self, camera_id):
        if camera_id not in self._cameras:
            if len(self._cameras) >= 128:
                self._cameras.popitem(last=False)
            self._cameras[camera_id] = {"counters": Counter(), "durations": {}}
        self._cameras.move_to_end(camera_id)
        return self._cameras[camera_id]

    def queue(self, pending, active, capacity=None):
        with self._lock:
            self._queue.update(pending=pending, active=int(active))
            if capacity is not None:
                self._queue["capacity"] = max(0, int(capacity))

    @staticmethod
    def _summary(samples):
        values = sorted(value * 1000 for value in samples)
        n = len(values)
        return {"window_count": n, "avg_ms": round(sum(values) / n, 2),
                "min_ms": round(values[0], 2), "max_ms": round(values[-1], 2),
                "p50_ms": round(values[math.ceil(n * .5) - 1], 2),
                "p95_ms": round(values[math.ceil(n * .95) - 1], 2)}

    def record(self, seconds: float) -> None:
        """Registra o tempo de inferência de uma imagem com placa reconhecida."""
        with self._lock:
            self._samples.append(seconds)
            self._total_count += 1
            self._total_sum += seconds

    def _legacy_snapshot(self) -> dict:
        """Retorna um snapshot das estatísticas acumuladas."""
        with self._lock:
            if not self._samples:
                return {
                    "count": 0,
                    "avg_ms": 0.0,
                    "min_ms": 0.0,
                    "max_ms": 0.0,
                    "p50_ms": 0.0,
                    "p95_ms": 0.0,
                    "window_count": 0,
                }
            data = sorted(self._samples)
            n = len(data)
            total_ms = self._total_sum * 1000
            avg_ms = total_ms / self._total_count if self._total_count else 0.0
            return {
                "count": self._total_count,
                "avg_ms": round(avg_ms, 2),
                "min_ms": round(data[0] * 1000, 2),
                "max_ms": round(data[-1] * 1000, 2),
                "p50_ms": round(data[n // 2] * 1000, 2),
                "p95_ms": round(data[int(n * 0.95)] * 1000, 2),
                "window_count": n,
            }

    def snapshot(self) -> dict:
        legacy = self._legacy_snapshot()
        with self._lock:
            return {**legacy, "version": 2,
                    "uptime_seconds": round(time.monotonic() - self._started, 3),
                    "window_capacity": self._max_samples,
                    "semantics": {"legacy": "successful inference only; avg/count lifetime, percentiles rolling",
                                  "durations": "milliseconds, rolling window per metric, nearest-rank percentiles; frame_age is measured when inference starts and capture_to_result when it ends; excludes Nest registration",
                                  "counters": "since process start/reset; snapshot_bytes is a byte sum; per-camera retained for 128 most recently active cameras",
                                  "queue": "current depth; capacity = max_monitors + max_manual_pending"},
                    "counters": dict(self._counters), "queue": dict(self._queue),
                    "durations": {k: self._summary(v) for k, v in self._durations.items()},
                    "cameras": {k: {"counters": dict(v["counters"]),
                                      "durations": {n: self._summary(s) for n, s in v["durations"].items()}}
                                for k, v in self._cameras.items()}}

    def reset(self) -> None:
        with self._lock:
            self._samples.clear()
            self._total_count = 0
            self._total_sum = 0.0
            self._started = time.monotonic()
            self._counters.clear()
            self._durations.clear()
            self._cameras.clear()
