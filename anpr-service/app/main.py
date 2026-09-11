"""ANPR HTTP application and single-owner background monitor lifecycle."""
from contextlib import asynccontextmanager
import numpy as np
from fastapi import FastAPI
from .config import settings
from .routers import reconhecer, monitors
from .services.inference import InferenceScheduler


@asynccontextmanager
async def lifespan(app):
    scheduler = InferenceScheduler()
    scheduler.start()
    app.state.inference = scheduler
    app.state.monitors = monitors.MonitorManager(scheduler)
    try:
        if settings.anpr_warmup:
            await scheduler.recognize(np.zeros((640, 640, 3), dtype=np.uint8))
        yield
    finally:
        await app.state.monitors.close()
        await scheduler.close()


app = FastAPI(title="ANPR Service", version="1.1.0", lifespan=lifespan)
app.include_router(reconhecer.router)
app.include_router(monitors.router)
