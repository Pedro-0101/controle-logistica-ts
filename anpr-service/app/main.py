"""Microserviço ANPR — reconhecimento offline de placas brasileiras (PaddleOCR)."""

from fastapi import FastAPI

from .routers import reconhecer

app = FastAPI(
    title="ANPR Service",
    description="Captura de snapshot de câmera IP e reconhecimento de placa via PaddleOCR.",
    version="1.0.0",
)

app.include_router(reconhecer.router)
