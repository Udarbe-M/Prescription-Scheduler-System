from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Prescription Scheduler OCR API")
    app_version: str = os.getenv("APP_VERSION", "0.1.0")
    host: str = os.getenv("API_HOST", "0.0.0.0")
    port: int = int(os.getenv("API_PORT", "8000"))
    debug: bool = _as_bool(os.getenv("DEBUG"), default=True)
    default_ocr_mode: str = os.getenv("DEFAULT_OCR_MODE", "auto")
    handwritten_model_name: str = os.getenv(
        "HANDWRITTEN_MODEL_NAME",
        "microsoft/trocr-large-handwritten",
    )
    prescription_model_name: str = os.getenv(
        "PRESCRIPTION_MODEL_NAME",
        "chinmays18/medical-prescription-ocr",
    )
    printed_language: str = os.getenv("PRINTED_TEXT_LANGUAGE", "en")
    max_image_size_mb: int = int(os.getenv("MAX_IMAGE_SIZE_MB", "12"))
    safety_api_timeout_seconds: int = int(os.getenv("SAFETY_API_TIMEOUT_SECONDS", "12"))
    openfda_api_key: str | None = os.getenv("OPENFDA_API_KEY")
    enable_prescription_model: bool = _as_bool(
        os.getenv("ENABLE_PRESCRIPTION_MODEL"),
        default=True,
    )
    cache_dir: Path = Path(os.getenv("MODEL_CACHE_DIR", ".cache"))

    def max_image_bytes(self) -> int:
        return self.max_image_size_mb * 1024 * 1024


settings = Settings()
