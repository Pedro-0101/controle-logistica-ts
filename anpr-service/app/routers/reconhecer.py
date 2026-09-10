"""Rotas de reconhecimento de placa (câmera IP ou imagem enviada)."""

from fastapi import APIRouter, HTTPException

from ..anpr.recognizer import get_recognizer
from ..schemas import (
    HealthOut,
    PlacaOut,
    ReconhecerCameraIn,
    ReconhecerCameraOut,
    ReconhecerImagemIn,
)
from ..services.camera import CameraConfig, capturar_snapshot
from ..services.erros import (
    CameraNaoConfiguradaError,
    CameraSnapshotError,
    PlacaNaoReconhecidaError,
)
from ..services.imagem import decodificar, decodificar_base64, salvar

router = APIRouter(tags=["anpr"])


@router.get("/health", response_model=HealthOut, summary="Healthcheck")
async def health() -> HealthOut:
    return HealthOut()


@router.post(
    "/reconhecer",
    response_model=ReconhecerCameraOut,
    summary="Captura imagem da câmera IP e retorna a placa do veículo",
    responses={
        400: {"description": "Credenciais inválidas ou camera_url malformada"},
        422: {"description": "Placa não reconhecida na imagem capturada"},
        502: {"description": "Falha ao conectar ou capturar imagem da câmera"},
    },
)
async def reconhecer_camera(body: ReconhecerCameraIn) -> ReconhecerCameraOut:
    """Captura um snapshot da câmera IP e retorna a placa via ANPR (PaddleOCR)."""
    camera = CameraConfig(
        ip=body.host,
        porta=body.port,
        usuario=body.user,
        senha=body.password,
        tipo_autenticacao=body.auth,
        url_snapshot=body.camera_url,
    )
    try:
        conteudo, url_encontrada = await capturar_snapshot(camera)
    except CameraNaoConfiguradaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CameraSnapshotError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        imagem = decodificar(conteudo)
    except ValueError as exc:
        raise HTTPException(
            status_code=502, detail="Imagem inválida retornada pela câmera"
        ) from exc

    melhor = _reconhecer_ou_422(imagem)
    foto_path = salvar(conteudo)

    return ReconhecerCameraOut(
        placa=melhor.placa.valor,
        formato=melhor.placa.formato,
        confianca=melhor.confianca,
        raw=melhor.raw,
        box=list(melhor.box) if melhor.box else None,
        camera_url_encontrada=url_encontrada,
        foto_path=foto_path,
    )


@router.post(
    "/reconhecer-imagem",
    response_model=PlacaOut,
    summary="Reconhece a placa em uma imagem enviada em base64",
    responses={
        400: {"description": "Imagem inválida"},
        422: {"description": "Placa não reconhecida na imagem"},
    },
)
async def reconhecer_imagem(body: ReconhecerImagemIn) -> PlacaOut:
    """Reconhece a placa em uma imagem enviada em base64 (sem acesso à câmera)."""
    try:
        imagem = decodificar_base64(body.imagem_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    melhor = _reconhecer_ou_422(imagem)

    return PlacaOut(
        placa=melhor.placa.valor,
        formato=melhor.placa.formato,
        confianca=melhor.confianca,
        raw=melhor.raw,
        box=list(melhor.box) if melhor.box else None,
    )


def _reconhecer_ou_422(imagem):
    """Executa o OCR e retorna o melhor candidato ou lança 422."""
    try:
        melhor = get_recognizer().reconhecer_melhor(imagem)
    except PlacaNaoReconhecidaError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Erro no ANPR: {exc}") from exc

    if melhor is None:
        raise HTTPException(status_code=422, detail="Placa não reconhecida na imagem")

    return melhor
