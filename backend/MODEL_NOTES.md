# OCR Model Notes

## Current runnable backend

- Printed text OCR: EasyOCR
- Handwritten OCR baseline: `microsoft/trocr-large-handwritten`
- Prescription-specific OCR candidate: `chinmays18/medical-prescription-ocr`

## Why the printed engine changed

The original plan used PaddleOCR for printed text, but the current Windows install path in this environment pulled extra native build dependencies that blocked setup. EasyOCR is the lighter, immediately-runnable fallback for the backend in this repo.

## Recommended upgrade path

If you later want a stronger printed OCR stack, revisit PaddleOCR for the backend after setting up the required native/runtime dependencies.
