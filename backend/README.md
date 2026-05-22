# Prescription Scheduler Backend

FastAPI backend for a React Native prescription scheduler app.

## Features

- Printed text OCR using EasyOCR
- Handwritten OCR using TrOCR
- Prescription-specific OCR option using a Donut-based model
- Simple medication parsing for name, dosage, frequency, and instructions

## API

- `GET /health`
- `GET /ocr/models`
- `POST /ocr/recognize`

## Quick Start

```bash
py -3.9 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Request Example

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "filename": "prescription.jpg",
  "ocr_mode": "auto",
  "parse_medication": true
}
```

## OCR Modes

- `auto`: tries the available engines and keeps the strongest text result
- `printed`: uses EasyOCR
- `handwritten`: uses TrOCR
- `prescription`: uses the prescription-specific Donut model

## Notes

- The Hugging Face models download on first use and can be large.
- OCR output still needs human review before real medication use.
