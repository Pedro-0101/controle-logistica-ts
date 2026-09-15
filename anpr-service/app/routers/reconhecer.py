"""Rotas de reconhecimento de placa (câmera IP ou imagem enviada)."""
import logging

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("anpr")

from ..schemas import (
    HealthOut,
    PlacaOut,
    ReconhecerCameraIn,
    ReconhecerCameraOut,
    ReconhecerImagemIn,
    StatsOut,
)
from ..services.camera import CameraConfig, capturar_snapshot
from ..services.erros import (
    CameraNaoConfiguradaError,
    CameraSnapshotError,
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
async def reconhecer_camera(body: ReconhecerCameraIn, request: Request) -> ReconhecerCameraOut:
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

    melhor = await request.app.state.inference.recognize(imagem)
    if melhor is None:
        logger.info("[reconhecer-camera] Nenhuma placa detectada na imagem da camera")
        raise HTTPException(422, "Placa não reconhecida na imagem")
    foto_path = salvar(conteudo)

    logger.info(
        "[reconhecer-camera] Placa reconhecida: %s | formato=%s | confianca=%.2f | camera_url=%s",
        melhor.placa.valor, melhor.placa.formato, melhor.confianca, url_encontrada,
    )

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
async def reconhecer_imagem(body: ReconhecerImagemIn, request: Request) -> PlacaOut:
    """Reconhece a placa em uma imagem enviada em base64 (sem acesso à câmera)."""
    try:
        imagem = decodificar_base64(body.imagem_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    melhor = await request.app.state.inference.recognize(imagem)
    if melhor is None:
        logger.info("[reconhecer-imagem] Nenhuma placa detectada na imagem")
        raise HTTPException(422, "Placa não reconhecida na imagem")

    logger.info(
        "[reconhecer-imagem] Placa reconhecida: %s | formato=%s | confianca=%.2f",
        melhor.placa.valor, melhor.placa.formato, melhor.confianca,
    )

    return PlacaOut(
        placa=melhor.placa.valor,
        formato=melhor.placa.formato,
        confianca=melhor.confianca,
        raw=melhor.raw,
        box=list(melhor.box) if melhor.box else None,
    )


@router.get(
    "/stats",
    response_model=StatsOut,
    summary="Estatísticas de tempo de inferência (somente imagens com placa reconhecida)",
)
async def inference_stats(request: Request) -> StatsOut:
    """Retorna métricas de tempo de inferência (YOLO + PaddleOCR) para imagens que tiveram placa reconhecida."""
    return StatsOut(**request.app.state.stats.snapshot())

