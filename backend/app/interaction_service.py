from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from .config import Settings
from .schemas import (
    InteractionAlert,
    InteractionCheckResponse,
    InteractionMedicationInput,
    InteractionMedicationMatch,
)

LOGGER = logging.getLogger(__name__)

RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov/REST"
OPENFDA_BASE_URL = "https://api.fda.gov/drug/label.json"
COMMON_NOISE_TOKENS = {
    "tablet",
    "tablets",
    "capsule",
    "capsules",
    "caplet",
    "pill",
    "pills",
    "oral",
    "solution",
    "mg",
    "mcg",
    "ml",
    "gram",
    "grams",
    "take",
    "dose",
}


@dataclass
class LabelSnapshot:
    brand_names: list[str] = field(default_factory=list)
    generic_names: list[str] = field(default_factory=list)
    sections: dict[str, str] = field(default_factory=dict)


@dataclass
class MedicationContext:
    original_name: str
    dosage: str | None = None
    normalized_name: str | None = None
    rxcui: str | None = None
    label: LabelSnapshot | None = None


class InteractionService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def check_interactions(
        self,
        medications: list[InteractionMedicationInput],
        max_alerts: int = 8,
    ) -> InteractionCheckResponse:
        contexts = [self._build_context(medication) for medication in medications if medication.name.strip()]
        alerts = self._build_alerts(contexts, max_alerts=max_alerts)
        unresolved = [
            context.original_name
            for context in contexts
            if context.label is None and context.rxcui is None
        ]
        matches = [
            InteractionMedicationMatch(
                name=context.original_name,
                dosage=context.dosage,
                normalized_name=context.normalized_name,
                rxcui=context.rxcui,
                label_brand_names=context.label.brand_names if context.label else [],
                label_generic_names=context.label.generic_names if context.label else [],
                label_found=context.label is not None,
            )
            for context in contexts
        ]
        return InteractionCheckResponse(
            success=True,
            checked_at=datetime.now(timezone.utc).isoformat(),
            medications=matches,
            alerts=alerts,
            unresolved_medications=unresolved,
            disclaimer=(
                "Informational only. This check uses current FDA label text and RxNorm name matching, "
                "not a complete clinical interaction engine. Confirm all medication changes with a "
                "licensed clinician or pharmacist."
            ),
        )

    def _build_context(self, medication: InteractionMedicationInput) -> MedicationContext:
        context = MedicationContext(
            original_name=medication.name.strip(),
            dosage=medication.dosage,
        )
        if not context.original_name:
            return context

        rxcui_data = self._lookup_rxcui(context.original_name)
        context.rxcui = rxcui_data.get("rxcui")
        context.normalized_name = rxcui_data.get("name") or self._strip_strength(context.original_name)
        context.label = self._lookup_label(context)
        return context

    def _lookup_rxcui(self, name: str) -> dict[str, str | None]:
        exact_url = f"{RXNORM_BASE_URL}/rxcui.json?name={quote_plus(name)}&search=2"
        try:
            data = self._read_json(exact_url)
            rxnorm_ids = data.get("idGroup", {}).get("rxnormId") or []
            if rxnorm_ids:
                rxcui = str(rxnorm_ids[0])
                return {"rxcui": rxcui, "name": self._lookup_rxnorm_name(rxcui)}
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.warning("RxNorm exact lookup failed for %s: %s", name, exc)

        approx_url = (
            f"{RXNORM_BASE_URL}/approximateTerm.json?term={quote_plus(name)}&maxEntries=1&option=1"
        )
        try:
            data = self._read_json(approx_url)
            candidate = (data.get("approximateGroup", {}).get("candidate") or [None])[0]
            if candidate:
                return {
                    "rxcui": str(candidate.get("rxcui")) if candidate.get("rxcui") else None,
                    "name": candidate.get("name"),
                }
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.warning("RxNorm approximate lookup failed for %s: %s", name, exc)

        return {"rxcui": None, "name": None}

    def _lookup_rxnorm_name(self, rxcui: str) -> str | None:
        url = f"{RXNORM_BASE_URL}/rxcui/{quote_plus(rxcui)}/properties.json"
        try:
            data = self._read_json(url)
            return data.get("properties", {}).get("name")
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.warning("RxNorm properties lookup failed for %s: %s", rxcui, exc)
            return None

    def _lookup_label(self, context: MedicationContext) -> LabelSnapshot | None:
        queries = []
        if context.rxcui:
            queries.append(f"openfda.rxcui:{quote_plus(context.rxcui)}")

        candidate_names = [
            context.normalized_name,
            self._strip_strength(context.original_name),
            context.original_name,
        ]
        for candidate in candidate_names:
            if candidate:
                escaped = candidate.replace('"', "")
                queries.append(f'openfda.generic_name:"{escaped}"')
                queries.append(f'openfda.brand_name:"{escaped}"')

        for query in queries:
            try:
                url = f"{OPENFDA_BASE_URL}?search={quote_plus(query)}&limit=1"
                data = self._read_json(url, include_api_key=True)
                results = data.get("results") or []
                if results:
                    return self._snapshot_from_label(results[0])
            except HTTPError as exc:
                if exc.code != 404:
                    LOGGER.warning(
                        "openFDA lookup failed for %s using %s: %s",
                        context.original_name,
                        query,
                        exc,
                    )
            except Exception as exc:  # pragma: no cover - defensive
                LOGGER.warning("openFDA lookup failed for %s using %s: %s", context.original_name, query, exc)
        return None

    def _snapshot_from_label(self, payload: dict[str, Any]) -> LabelSnapshot:
        openfda = payload.get("openfda", {})
        sections = {
            "drug_interactions": self._join_label_field(payload.get("drug_interactions")),
            "contraindications": self._join_label_field(payload.get("contraindications")),
            "boxed_warning": self._join_label_field(payload.get("boxed_warning")),
            "warnings": self._join_label_field(payload.get("warnings")),
        }
        return LabelSnapshot(
            brand_names=self._dedupe_strings(openfda.get("brand_name") or []),
            generic_names=self._dedupe_strings(openfda.get("generic_name") or []),
            sections={key: value for key, value in sections.items() if value},
        )

    def _build_alerts(self, contexts: list[MedicationContext], max_alerts: int) -> list[InteractionAlert]:
        alerts: list[InteractionAlert] = []
        seen: set[tuple[str, str, str]] = set()

        for index, left in enumerate(contexts):
            if left.label is None:
                continue
            for right in contexts[index + 1 :]:
                if right.label is None:
                    continue
                alert = self._compare_pair(left, right)
                if not alert:
                    continue
                key = tuple(sorted(alert.medications)) + (alert.section,)
                if key in seen:
                    continue
                seen.add(key)
                alerts.append(alert)
                if len(alerts) >= max_alerts:
                    return alerts
        return alerts

    def _compare_pair(self, left: MedicationContext, right: MedicationContext) -> InteractionAlert | None:
        section_priority = [
            ("drug_interactions", "high"),
            ("boxed_warning", "high"),
            ("contraindications", "high"),
            ("warnings", "moderate"),
        ]

        for section, severity in section_priority:
            left_text = left.label.sections.get(section, "") if left.label else ""
            right_text = right.label.sections.get(section, "") if right.label else ""

            right_match = self._find_match(left_text, self._candidate_phrases(right))
            left_match = self._find_match(right_text, self._candidate_phrases(left))
            phrase = right_match or left_match
            evidence_source = left_text if right_match else right_text

            if phrase and evidence_source:
                readable_section = section.replace("_", " ")
                return InteractionAlert(
                    medications=[left.original_name, right.original_name],
                    severity=severity,  # type: ignore[arg-type]
                    section=readable_section,
                    summary=(
                        f"{left.original_name} and {right.original_name} appear together in the FDA "
                        f"{readable_section} section. Review this combination before taking both."
                    ),
                    evidence_excerpt=self._excerpt_for_phrase(evidence_source, phrase),
                )

        return None

    def _candidate_phrases(self, context: MedicationContext) -> list[str]:
        phrases = [
            context.original_name,
            context.normalized_name,
            *(context.label.generic_names if context.label else []),
            *(context.label.brand_names if context.label else []),
        ]
        cleaned: list[str] = []
        for phrase in phrases:
            if not phrase:
                continue
            base = self._strip_strength(phrase)
            if len(base) < 4:
                continue
            cleaned.append(base.lower())
        return self._dedupe_strings(cleaned)

    def _find_match(self, haystack: str, phrases: list[str]) -> str | None:
        text = haystack.lower()
        for phrase in phrases:
            if phrase in COMMON_NOISE_TOKENS:
                continue
            if len(phrase) < 4:
                continue
            if re.search(rf"\b{re.escape(phrase)}\b", text):
                return phrase
        return None

    def _excerpt_for_phrase(self, text: str, phrase: str) -> str:
        lowered = text.lower()
        idx = lowered.find(phrase.lower())
        if idx == -1:
            return text[:220].strip()
        start = max(0, idx - 80)
        end = min(len(text), idx + len(phrase) + 140)
        excerpt = text[start:end].strip().replace("\n", " ")
        excerpt = re.sub(r"\s{2,}", " ", excerpt)
        if start > 0:
            excerpt = f"...{excerpt}"
        if end < len(text):
            excerpt = f"{excerpt}..."
        return excerpt

    def _read_json(self, url: str, include_api_key: bool = False) -> dict[str, Any]:
        headers = {"User-Agent": "PrescriptionScheduler/1.0"}
        if include_api_key and self.settings.openfda_api_key:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}api_key={quote_plus(self.settings.openfda_api_key)}"
        request = Request(url, headers=headers)
        with urlopen(request, timeout=self.settings.safety_api_timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    @staticmethod
    def _join_label_field(value: Any) -> str:
        if isinstance(value, list):
            return " ".join(item for item in value if isinstance(item, str)).strip()
        if isinstance(value, str):
            return value.strip()
        return ""

    @staticmethod
    def _strip_strength(value: str) -> str:
        cleaned = re.sub(
            r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|iu|tablet|tablets|capsules?|caps?|pills?)\b",
            " ",
            value,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"[^A-Za-z0-9 /-]", " ", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -/")
        return cleaned

    @staticmethod
    def _dedupe_strings(values: list[str]) -> list[str]:
        seen: set[str] = set()
        output: list[str] = []
        for value in values:
            normalized = value.strip()
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            output.append(normalized)
        return output
