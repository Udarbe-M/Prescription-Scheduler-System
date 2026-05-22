from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .ocr_service import OCRManager
from .schemas import HealthResponse, OCRRequest, OCRResponse

logging.basicConfig(level=logging.INFO)

ocr_manager = OCRManager(settings)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend for a prescription scheduler mobile app with OCR support for "
        "printed text and handwritten prescriptions."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "default_ocr_mode": settings.default_ocr_mode,
        "endpoints": {
            "GET /health": "Backend and OCR model status",
            "GET /ocr/models": "Available OCR engines",
            "POST /ocr/recognize": "Recognize printed or handwritten prescription text",
        },
    }


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        app_name=settings.app_name,
        app_version=settings.app_version,
        default_ocr_mode=settings.default_ocr_mode,
        models=ocr_manager.get_model_status(),
    )


@app.get("/ocr/models", tags=["ocr"])
def list_models() -> dict:
    return {"models": ocr_manager.get_model_status()}


@app.post("/ocr/recognize", response_model=OCRResponse, tags=["ocr"])
def recognize_prescription(payload: OCRRequest) -> OCRResponse:
    try:
        image = ocr_manager.decode_base64_image(
            payload.image_base64,
            max_bytes=settings.max_image_bytes(),
        )
        return ocr_manager.recognize(image, payload.ocr_mode, payload.parse_medication)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=500, detail=str(exc)) from exc
