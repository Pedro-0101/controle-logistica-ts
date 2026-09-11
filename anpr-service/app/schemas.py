"""Schemas Pydantic do microserviço ANPR."""

from pydantic import BaseModel, Field


class PlacaOut(BaseModel):
    placa: str = Field(..., description="Placa normalizada (ex: ABC1D23)")
    formato: str = Field(..., description="Formato: 'mercosul' ou 'antiga'")
    confianca: float = Field(..., description="Score de confiança do OCR (0-1)")
    raw: str = Field(..., description="Texto bruto capturado pelo OCR")
    box: list[float] | None = Field(
        None,
        description="Bounding box da placa [x1, y1, x2, y2] em pixels da imagem de entrada",
    )


class ReconhecerCameraIn(BaseModel):
    host: str = Field(..., description="IP da câmera", examples=["192.168.11.241"])
    port: int = Field(80, description="Porta HTTP da câmera")
    user: str = Field("", description="Usuário da câmera")
    password: str = Field("", description="Senha da câmera")
    auth: str = Field("digest", description="Autenticação: 'digest' ou 'basic'")
    camera_url: str | None = Field(
        None,
        description="URL completa do snapshot (opcional; senão tenta auto-descoberta)",
        examples=["http://192.168.11.241/ISAPI/Streaming/channels/101/picture"],
    )


class ReconhecerCameraOut(PlacaOut):
    camera_url_encontrada: str | None = Field(
        None, description="URL de snapshot que retornou imagem válida"
    )
    foto_path: str | None = Field(None, description="Caminho da imagem salva em disco")


class ReconhecerImagemIn(BaseModel):
    imagem_base64: str = Field(
        ..., description="Imagem (JPEG/PNG) codificada em base64"
    )


class HealthOut(BaseModel):
    status: str = "ok"


class MonitorIn(ReconhecerCameraIn):
    interval_seconds: float = Field(1, ge=0.1, le=3600)
    stale_after_seconds: float = Field(5, ge=0.2, le=3600)
    confirmation_reads: int = Field(2, ge=1, le=20)
