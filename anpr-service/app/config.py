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
    inference_timeout_seconds: float = Field(30.0, gt=0)
    max_manual_pending: int = Field(4, ge=1, le=64)
    max_monitors: int = Field(64, ge=1, le=128)
    max_saved_images: int = Field(1000, ge=1)
    max_snapshot_bytes: int = Field(8 * 1024 * 1024, ge=1024)
    max_image_pixels: int = Field(8_000_000, ge=1)
    capture_timeout_seconds: float = Field(10, gt=0)
    imagens_dir: Path = BASE_DIR / "data" / "imagens"


settings = Settings()
