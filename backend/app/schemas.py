from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


OCRMode = Literal["auto", "printed", "handwritten", "prescription"]
ScheduleFrequency = Literal["daily", "twice", "thrice", "weekly"]
InteractionSeverity = Literal["high", "moderate", "info"]


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


class InteractionMedicationInput(BaseModel):
    name: str
    dosage: Optional[str] = None


class InteractionMedicationMatch(BaseModel):
    name: str
    dosage: Optional[str] = None
    normalized_name: Optional[str] = None
    rxcui: Optional[str] = None
    label_brand_names: list[str] = Field(default_factory=list)
    label_generic_names: list[str] = Field(default_factory=list)
    label_found: bool = False


class InteractionAlert(BaseModel):
    medications: list[str] = Field(default_factory=list)
    severity: InteractionSeverity
    section: str
    summary: str
    evidence_excerpt: Optional[str] = None


class InteractionCheckRequest(BaseModel):
    medications: list[InteractionMedicationInput] = Field(default_factory=list)
    max_alerts: int = Field(default=8, ge=1, le=20)


class InteractionCheckResponse(BaseModel):
    success: bool
    checked_at: str
    medications: list[InteractionMedicationMatch] = Field(default_factory=list)
    alerts: list[InteractionAlert] = Field(default_factory=list)
    unresolved_medications: list[str] = Field(default_factory=list)
    disclaimer: str
