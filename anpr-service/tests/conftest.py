"""Shared fixtures use real image decoding and HTTP, never download OCR weights."""
import cv2
import numpy as np
import pytest

from app.anpr.plate import Placa
from app.anpr.recognizer import CandidatoPlaca


@pytest.fixture
def jpeg():
    return cv2.imencode(".jpg", np.zeros((32, 64, 3), dtype=np.uint8))[1].tobytes()


@pytest.fixture
def candidate():
    return CandidatoPlaca(Placa("ABC1D23", "mercosul"), .95, "ABC1D23", (1, 2, 30, 12))
