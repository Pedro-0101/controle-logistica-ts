"""Configurações do microserviço ANPR carregadas de variáveis de ambiente / .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # anpr-service/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anpr_lang: str = "en"
    imagens_dir: Path = BASE_DIR / "data" / "imagens"


settings = Settings()
