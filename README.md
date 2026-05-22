# Prescription Scheduler System

Prescription Scheduler System is a monorepo for a React Native medication app and a FastAPI OCR backend.

## What it includes

- `mobile/`: Expo React Native app for scanning prescriptions, storing medications, tracking pill stock, and scheduling reminders
- `backend/`: FastAPI service for printed OCR, handwritten OCR, and prescription parsing

## Mobile features

- Capture or upload a prescription image
- Send the image to the backend for OCR
- Review extracted medication name, dosage, and instructions before saving
- Store medications locally
- Track today's medication schedule
- Mark doses as taken and decrement pill quantity
- Receive local medication reminders

## Backend OCR approach

- Printed text: EasyOCR in the runnable backend, with PaddleOCR documented as a stronger upgrade candidate
- Handwriting baseline: TrOCR
- Prescription-specific option: Donut-based medical prescription OCR

## Run the backend

```bash
cd backend
py -3.9 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Run the mobile app

```bash
cd mobile
npm install
npx expo start
```

## Mobile setup notes

- On a physical phone, open Settings in the app and set the API URL to your computer's local IP, for example `http://192.168.1.20:8000`
- The OCR models may take time to download and warm up on the first backend request

## Important caution

OCR output for medical prescriptions must be reviewed by a human before use. This project is for personal productivity and prototyping, not clinical decision-making.
