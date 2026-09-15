"""Rastreamento de tempo de inferência para reconhecimento de placas.

Armazena em memória os tempos de inferência (YOLO + PaddleOCR) para cada
imagem que teve placa reconhecida. Expõe estatísticas: média, mediana,
mínimo, máximo, p95 e contagem total.
"""
import threading
from collections import deque


class InferenceStats:
    def __init__(self, max_samples: int = 1000) -> None:
        self._lock = threading.Lock()
        self._samples: deque[float] = deque(maxlen=max_samples)
        self._total_count = 0
        self._total_sum = 0.0

    def record(self, seconds: float) -> None:
        """Registra o tempo de inferência de uma imagem com placa reconhecida."""
        with self._lock:
            self._samples.append(seconds)
            self._total_count += 1
            self._total_sum += seconds

    def snapshot(self) -> dict:
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

    def reset(self) -> None:
        with self._lock:
            self._samples.clear()
            self._total_count = 0
            self._total_sum = 0.0
