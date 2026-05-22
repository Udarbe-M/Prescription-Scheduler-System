from __future__ import annotations

import base64
import io
import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
from PIL import Image

from .config import Settings
from .parsers import normalize_text, parse_prescription_text
from .schemas import OCRMode, OCRModelStatus, OCRResponse

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    engine: str
    text: str
    confidence: Optional[float]


class PrintedOCREngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._reader = None
        self._load_error: Optional[str] = None

    def load(self) -> None:
        if self._reader is not None or self._load_error:
            return
        try:
            import easyocr
            import torch

            self._reader = easyocr.Reader(
                [self.settings.printed_language],
                gpu=torch.cuda.is_available(),
            )
        except Exception as exc:  # pragma: no cover - depends on local model runtime
            self._load_error = str(exc)
            logger.exception("Failed to load EasyOCR")

    def available(self) -> bool:
        self.load()
        return self._reader is not None

    def detail(self) -> str:
        if self._reader is not None:
            return "Ready"
        return self._load_error or "Not loaded"

    def recognize(self, image: Image.Image) -> OCRResult:
        self.load()
        if self._reader is None:
            raise RuntimeError(self.detail())

        result = self._reader.readtext(np.array(image.convert("RGB")), detail=1, paragraph=True)
        texts: list[str] = []
        scores: list[float] = []
        for line in result:
            if len(line) >= 3:
                _, text, score = line
                if text:
                    texts.append(text)
                    scores.append(float(score))
        joined = "\n".join(texts).strip()
        avg_confidence = float(sum(scores) / len(scores)) if scores else None
        return OCRResult(engine="easyocr-printed", text=joined, confidence=avg_confidence)


class TrOCREngine:
    def __init__(self, model_name: str, label: str) -> None:
        self.model_name = model_name
        self.label = label
        self._processor = None
        self._model = None
        self._torch = None
        self._load_error: Optional[str] = None
        self._device = "cpu"

    def load(self) -> None:
        if self._model is not None or self._load_error:
            return
        try:
            import torch
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            self._torch = torch
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._processor = TrOCRProcessor.from_pretrained(self.model_name)
            self._model = VisionEncoderDecoderModel.from_pretrained(self.model_name)
            self._model.to(self._device)
        except Exception as exc:  # pragma: no cover - depends on local model runtime
            self._load_error = str(exc)
            logger.exception("Failed to load TrOCR model")

    def available(self) -> bool:
        self.load()
        return self._model is not None and self._processor is not None

    def detail(self) -> str:
        if self._model is not None:
            return f"Ready on {self._device}"
        return self._load_error or "Not loaded"

    def recognize(self, image: Image.Image) -> OCRResult:
        self.load()
        if self._model is None or self._processor is None or self._torch is None:
            raise RuntimeError(self.detail())

        pixel_values = self._processor(images=image.convert("RGB"), return_tensors="pt").pixel_values
        pixel_values = pixel_values.to(self._device)
        generated_ids = self._model.generate(pixel_values)
        generated_text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return OCRResult(engine=self.label, text=generated_text.strip(), confidence=None)


class DonutPrescriptionEngine:
    def __init__(self, model_name: str, enabled: bool) -> None:
        self.model_name = model_name
        self.enabled = enabled
        self._processor = None
        self._model = None
        self._torch = None
        self._load_error: Optional[str] = None
        self._device = "cpu"

    def load(self) -> None:
        if not self.enabled or self._model is not None or self._load_error:
            return
        try:
            import torch
            from transformers import DonutProcessor, VisionEncoderDecoderModel

            self._torch = torch
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._processor = DonutProcessor.from_pretrained(self.model_name)
            self._model = VisionEncoderDecoderModel.from_pretrained(self.model_name)
            self._model.to(self._device)
        except Exception as exc:  # pragma: no cover - depends on local model runtime
            self._load_error = str(exc)
            logger.exception("Failed to load prescription Donut model")

    def available(self) -> bool:
        self.load()
        return self.enabled and self._model is not None and self._processor is not None

    def detail(self) -> str:
        if not self.enabled:
            return "Disabled by configuration"
        if self._model is not None:
            return f"Ready on {self._device}"
        return self._load_error or "Not loaded"

    def recognize(self, image: Image.Image) -> OCRResult:
        self.load()
        if self._model is None or self._processor is None or self._torch is None:
            raise RuntimeError(self.detail())

        pixel_values = self._processor(images=image.convert("RGB"), return_tensors="pt").pixel_values
        pixel_values = pixel_values.to(self._device)
        prompt_ids = self._processor.tokenizer("<s_ocr>", return_tensors="pt").input_ids.to(self._device)
        generated_ids = self._model.generate(
            pixel_values,
            decoder_input_ids=prompt_ids,
            max_length=512,
            num_beams=1,
            early_stopping=True,
        )
        text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return OCRResult(engine="donut-prescription", text=text.strip(), confidence=None)


class OCRManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.printed = PrintedOCREngine(settings)
        self.handwritten = TrOCREngine(settings.handwritten_model_name, "trocr-handwritten")
        self.prescription = DonutPrescriptionEngine(
            settings.prescription_model_name,
            settings.enable_prescription_model,
        )

    @staticmethod
    def decode_base64_image(image_data: str, max_bytes: int) -> Image.Image:
        payload = image_data.split("base64,", 1)[1] if "base64," in image_data else image_data
        payload = payload.strip()
        raw = base64.b64decode(payload)
        if len(raw) > max_bytes:
            raise ValueError(f"Image is too large. Limit is {max_bytes // (1024 * 1024)} MB.")
        return Image.open(io.BytesIO(raw)).convert("RGB")

    def get_model_status(self) -> list[OCRModelStatus]:
        return [
            OCRModelStatus(
                key="printed",
                label="EasyOCR printed/general OCR",
                loaded=self.printed._reader is not None,
                available=self.printed.available(),
                detail=self.printed.detail(),
            ),
            OCRModelStatus(
                key="handwritten",
                label=self.settings.handwritten_model_name,
                loaded=self.handwritten._model is not None,
                available=self.handwritten.available(),
                detail=self.handwritten.detail(),
            ),
            OCRModelStatus(
                key="prescription",
                label=self.settings.prescription_model_name,
                loaded=self.prescription._model is not None,
                available=self.prescription.available(),
                detail=self.prescription.detail(),
            ),
        ]

    @staticmethod
    def _score_candidate(result: OCRResult) -> tuple[int, int]:
        compact = "".join(ch for ch in result.text if ch.isalnum())
        return (len(compact), len(result.text))

    def _auto_recognize(self, image: Image.Image) -> OCRResult:
        candidates: list[OCRResult] = []
        errors: list[str] = []

        for engine in (self.prescription, self.printed, self.handwritten):
            try:
                if engine.available():
                    candidates.append(engine.recognize(image))
            except Exception as exc:  # pragma: no cover - runtime dependent
                errors.append(str(exc))

        if not candidates:
            joined = "; ".join(errors) if errors else "No OCR engines are available."
            raise RuntimeError(joined)

        return max(candidates, key=self._score_candidate)

    def recognize(self, image: Image.Image, mode: OCRMode, parse_medication: bool) -> OCRResponse:
        if mode == "printed":
            result = self.printed.recognize(image)
        elif mode == "handwritten":
            result = self.handwritten.recognize(image)
        elif mode == "prescription":
            result = self.prescription.recognize(image)
        else:
            result = self._auto_recognize(image)

        normalized = normalize_text(result.text)
        parsed = parse_prescription_text(normalized) if parse_medication else None
        return OCRResponse(
            success=True,
            engine=result.engine,
            mode_used=mode,
            text=result.text,
            normalized_text=normalized,
            confidence=result.confidence,
            parsed=parsed,
        )
