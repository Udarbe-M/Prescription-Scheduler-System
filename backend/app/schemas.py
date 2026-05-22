from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


OCRMode = Literal["auto", "printed", "handwritten", "prescription"]
ScheduleFrequency = Literal["daily", "twice", "thrice", "weekly"]


class OCRRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 image data or data URI")
    filename: Optional[str] = Field(default="prescription.jpg")
    ocr_mode: OCRMode = Field(default="auto")
    parse_medication: bool = Field(default=True)


class ExtractedMedication(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[ScheduleFrequency] = None
    instructions: Optional[str] = None
    quantity_hint: Optional[int] = None


class ParsedPrescription(BaseModel):
    medications: list[ExtractedMedication] = Field(default_factory=list)
    primary_medication: Optional[ExtractedMedication] = None


class OCRResponse(BaseModel):
    success: bool
    engine: str
    mode_used: OCRMode
    text: str
    normalized_text: str
    confidence: Optional[float] = None
    parsed: Optional[ParsedPrescription] = None


class OCRModelStatus(BaseModel):
    key: str
    label: str
    loaded: bool
    available: bool
    detail: str


class HealthResponse(BaseModel):
    status: str
    app_name: str
    app_version: str
    default_ocr_mode: str
    models: list[OCRModelStatus]
