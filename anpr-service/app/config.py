"""Configurações do microserviço ANPR carregadas de variáveis de ambiente / .env."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # anpr-service/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anpr_lang: str = "en"
    anpr_warmup: bool = False
    # Detecção YOLO: modelo vazio = auto (weights/best.pt local, senão HuggingFace).
    anpr_yolo_model: str = ""
    anpr_yolo_imgsz: int = Field(640, ge=128, le=4096)
    anpr_yolo_conf: float = Field(0.25, gt=0.0, le=1.0)
    # Pré-processamento antes do OCR (CLAHE + redução de ruído + upscale).
    anpr_preprocessar: bool = True
    anpr_upscale_altura_min: int = Field(64, ge=0, le=512)
    # Tempo (s) que cada leitura de placa permanece válida para a votação. A
    # janela total de confirmação é `confirmation_reads * anpr_read_ttl_seconds`
    # (ex.: 2 leituras × 10 s = 20 s), tolerando frames sem detecção do OCR.
    anpr_read_ttl_seconds: float = Field(10.0, gt=0)
    # Fração recortada de cada borda (topo/base/laterais) antes da detecção,
    # para descartar overlays da câmera (nome, data/hora) que o OCR confunde
    # com placa. 0.10 = remove 10% de cada lado.
    anpr_crop_bordas_percent: float = Field(0.10, ge=0.0, le=0.4)
    inference_timeout_seconds: float = Field(30.0, gt=0)
    max_manual_pending: int = Field(4, ge=1, le=64)
    max_monitors: int = Field(64, ge=1, le=128)
    max_saved_images: int = Field(1000, ge=1)
    max_snapshot_bytes: int = Field(8 * 1024 * 1024, ge=1024)
    max_image_pixels: int = Field(8_000_000, ge=1)
    capture_timeout_seconds: float = Field(10, gt=0)
    imagens_dir: Path = BASE_DIR / "data" / "imagens"


settings = Settings()
