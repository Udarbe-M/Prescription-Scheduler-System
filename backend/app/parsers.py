from __future__ import annotations

import re

from .schemas import ExtractedMedication, ParsedPrescription


DOSAGE_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|tabs?|tablets?|caps?|capsules?|pills?)\b",
    re.IGNORECASE,
)
QUANTITY_RE = re.compile(r"\b(?:qty|quantity|dispense)\s*[:\-]?\s*(\d+)\b", re.IGNORECASE)
MED_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9\-/ ]{1,80}$")


def normalize_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    filtered = [line for line in lines if line]
    return "\n".join(filtered)


def detect_frequency(text: str) -> str | None:
    lowered = text.lower()
    if any(token in lowered for token in ["three times", "thrice", "3x", "three daily"]):
        return "thrice"
    if any(token in lowered for token in ["two times", "twice", "2x", "bid"]):
        return "twice"
    if any(token in lowered for token in ["weekly", "once weekly", "every week"]):
        return "weekly"
    if lowered:
        return "daily"
    return None


def detect_instruction(text: str) -> str | None:
    lowered = text.lower()
    instruction_map = [
        (["with food", "after meal", "after meals"], "Take with food"),
        (["before meal", "before meals"], "Take before meals"),
        (["bedtime", "before bed"], "Take at bedtime"),
        (["as needed", "prn"], "Take as needed"),
        (["morning"], "Take in the morning"),
        (["evening", "night"], "Take in the evening"),
    ]
    for needles, instruction in instruction_map:
        if any(needle in lowered for needle in needles):
            return instruction
    return None


def _candidate_name(line: str, dosage: str | None) -> str | None:
    cleaned = line
    if dosage:
        cleaned = cleaned.replace(dosage, "").strip(" -:,")
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    if not cleaned or not MED_LINE_RE.match(cleaned):
        return None
    return cleaned.title()


def parse_prescription_text(text: str) -> ParsedPrescription:
    normalized = normalize_text(text)
    lines = normalized.splitlines()
    medications: list[ExtractedMedication] = []

    for line in lines:
        dosage_match = DOSAGE_RE.search(line)
        if not dosage_match and len(medications) >= 3:
            continue

        dosage = dosage_match.group(0) if dosage_match else None
        name = _candidate_name(line, dosage)
        if name or dosage:
            quantity_match = QUANTITY_RE.search(line)
            medications.append(
                ExtractedMedication(
                    name=name,
                    dosage=dosage,
                    frequency=detect_frequency(normalized),
                    instructions=detect_instruction(normalized),
                    quantity_hint=int(quantity_match.group(1)) if quantity_match else None,
                )
            )

    if not medications and normalized:
        medications.append(
            ExtractedMedication(
                name=lines[0].title() if lines else None,
                dosage=DOSAGE_RE.search(normalized).group(0) if DOSAGE_RE.search(normalized) else None,
                frequency=detect_frequency(normalized),
                instructions=detect_instruction(normalized),
            )
        )

    primary = medications[0] if medications else None
    return ParsedPrescription(medications=medications, primary_medication=primary)
