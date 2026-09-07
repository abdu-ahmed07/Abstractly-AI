"""Gemini-based relevance scoring for Semantic Scholar papers."""

from __future__ import annotations

import json
import math
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

import google.generativeai as genai

from .semantic_scholar import ResearchPaper


_MIN_SCORING_INTERVAL_SECONDS = 1.0
_SCORING_RATE_LIMIT_LOCK = threading.Lock()
_LAST_SCORING_STARTED_AT = 0.0


@dataclass(frozen=True, slots=True)
class ScoredResearchPaper:
    """A paper paired with its Gemini relevance assessment."""

    paper: ResearchPaper
    relevance_score: int | None
    rationale: str


class GeminiScoringError(RuntimeError):
    """Raised when Gemini cannot produce a valid relevance assessment."""


class GeminiRelevanceScorer:
    """Score how closely a paper matches a research topic with Gemini."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        model_name: str = "gemini-3.6-flash",
        model: Any | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self.api_key and model is None:
            raise GeminiScoringError(
                "GEMINI_API_KEY is not set. Add it to the environment before scoring papers."
            )

        if model is not None:
            self.model = model
        else:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(model_name)

    def score_paper(self, topic: str, paper: ResearchPaper) -> ScoredResearchPaper:
        """Return a validated relevance score and rationale for one paper."""
        prompt = self._build_prompt(topic, paper)

        try:
            self._wait_between_requests()
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0,
                    "response_mime_type": "application/json",
                },
            )
        except Exception as error:
            raise GeminiScoringError(
                f"Gemini API request failed: {error}"
            ) from error

        try:
            response_text = getattr(response, "text", None)
        except Exception as error:
            raise GeminiScoringError(
                f"Gemini response could not be read: {error}"
            ) from error
        if not isinstance(response_text, str) or not response_text.strip():
            raise GeminiScoringError("Gemini returned an empty response.")

        try:
            payload = json.loads(self._remove_code_fence(response_text))
        except json.JSONDecodeError as error:
            raise GeminiScoringError(
                f"Gemini returned malformed JSON: {error.msg}"
            ) from error

        score, rationale = self._validate_payload(payload)
        return ScoredResearchPaper(
            paper=paper,
            relevance_score=score,
            rationale=rationale,
        )

    @staticmethod
    def failed_assessment(
        paper: ResearchPaper,
        error_message: str,
    ) -> ScoredResearchPaper:
        """Represent a failed score without inventing a relevance value."""
        return ScoredResearchPaper(
            paper=paper,
            relevance_score=None,
            rationale=f"Scoring failed: {error_message}",
        )

    @staticmethod
    def _wait_between_requests() -> None:
        """Keep Gemini scoring request starts at least one second apart."""
        global _LAST_SCORING_STARTED_AT

        with _SCORING_RATE_LIMIT_LOCK:
            elapsed = time.monotonic() - _LAST_SCORING_STARTED_AT
            if _LAST_SCORING_STARTED_AT and elapsed < _MIN_SCORING_INTERVAL_SECONDS:
                time.sleep(_MIN_SCORING_INTERVAL_SECONDS - elapsed)
            _LAST_SCORING_STARTED_AT = time.monotonic()

    @staticmethod
    def _build_prompt(topic: str, paper: ResearchPaper) -> str:
        abstract = paper.abstract or "No abstract available."
        return f"""Evaluate how relevant this research paper is to the user's research topic.

Research topic:
{topic}

Paper title:
{paper.title}

Paper abstract:
{abstract}

Return only a JSON object with exactly these fields:
{{
  "relevance_score": <integer from 0 to 100>,
  "rationale": "<one or two sentence explanation of why the paper does or does not match>"
}}
"""

    @staticmethod
    def _remove_code_fence(response_text: str) -> str:
        cleaned = response_text.strip()
        if cleaned.startswith("```") and cleaned.endswith("```"):
            lines = cleaned.splitlines()
            return "\n".join(lines[1:-1]).strip()
        return cleaned

    @staticmethod
    def _validate_payload(payload: Any) -> tuple[int, str]:
        if not isinstance(payload, dict):
            raise GeminiScoringError("Gemini response must be a JSON object.")

        raw_score = payload.get("relevance_score")
        rationale = payload.get("rationale")
        if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
            raise GeminiScoringError(
                "Gemini response has an invalid relevance_score."
            )
        if not math.isfinite(raw_score) or not 0 <= raw_score <= 100:
            raise GeminiScoringError(
                "Gemini relevance_score must be between 0 and 100."
            )
        if not isinstance(rationale, str) or not rationale.strip():
            raise GeminiScoringError("Gemini response has an invalid rationale.")

        return round(raw_score), rationale.strip()