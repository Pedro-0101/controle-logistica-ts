"""Optional offline smoke against cached CURRENT models; no alternate model benchmark.

Run: node scripts/python.mjs tests/smoke_current_model.py
Requires existing PaddleOCR model cache and weights/best.pt. Refuses missing files.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import socket


def no_network(*args, **kwargs):
    raise RuntimeError("Offline smoke prohibits network connections")


socket.socket.connect = no_network
socket.socket.connect_ex = no_network

import cv2
import paddleocr

original_pipeline = paddleocr.PaddleOCR
original_reader = paddleocr.TextRecognition
detector_name, reader_name = original_pipeline._get_ocr_model_names(
    object.__new__(original_pipeline), settings.anpr_lang, None)
cache = Path.home() / ".paddlex" / "official_models"
for name in (detector_name, reader_name):
    if not (cache / name / "inference.json").exists():
        raise RuntimeError(f"Current model is not cached: {name}")


class LocalPipeline(original_pipeline):
    def __init__(self, **kwargs):
        kwargs.pop("lang", None)
        # The recognizer already pins the models; LocalPipeline keeps them local.
        kwargs.pop("text_detection_model_name", None)
        kwargs.pop("text_recognition_model_name", None)
        super().__init__(**kwargs, text_detection_model_name=detector_name,
                         text_detection_model_dir=str(cache / detector_name),
                         text_recognition_model_name=reader_name,
                         text_recognition_model_dir=str(cache / reader_name))


def local_reader(**kwargs):
    if kwargs["model_name"] != reader_name:
        raise RuntimeError("Smoke must keep the currently selected model")
    return original_reader(**kwargs, model_dir=str(cache / reader_name))


paddleocr.PaddleOCR = LocalPipeline
paddleocr.TextRecognition = local_reader
from app.anpr.recognizer import PlacaRecognizer
from app.anpr.detector import _resolver_modelo

if not Path(_resolver_modelo()).is_file():
    raise RuntimeError("Current YOLO weights must exist locally")

recognizer = PlacaRecognizer(settings.anpr_lang)
photo = Path(__file__).parent / "photos" / "fxk6j85 2.jpg"
image = cv2.imread(str(photo))
if image is None:
    raise RuntimeError("Missing smoke photo")
result = recognizer.reconhecer_melhor(image, full_frame_fallback=False)
print({"recognition_model": reader_name, "photo": photo.name,
       "plate": result.placa.valor if result else None,
       "confidence": result.confianca if result else None})
if result is None:
    raise RuntimeError("No plate read from smoke fixture")
