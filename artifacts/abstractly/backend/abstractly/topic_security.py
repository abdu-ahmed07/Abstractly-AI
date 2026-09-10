"""Validation for user-provided research topics."""

from __future__ import annotations

import re
import unicodedata


MAX_TOPIC_LENGTH = 200
_ALLOWED_TOPIC_CHARACTERS = frozenset("&+.,:;/'()-#")
_CONTROL_OR_FORMAT_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Cn"})
_PROMPT_INJECTION_PATTERNS = (
    re.compile(
        r"\bignore(?:\s+(?:all|any|the))?\s+"
        r"(?:(?:previous|prior|above|earlier)\s+)?instructions?\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:disregard|override|forget|bypass)\b.{0,40}"
        r"\b(?:instructions?|rules?|prompt|system\s+message)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:system|developer)\s+(?:prompt|message|instructions?)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:reveal|show|print|repeat|output)\s+(?:the\s+)?"
        r"(?:system|developer)\s+(?:prompt|message|instructions?)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bdo\s+not\s+follow\b", re.IGNORECASE),
)


class TopicValidationError(ValueError):
    """Raised when a topic is empty, unsafe, or unsupported."""


def sanitize_research_topic(value: object) -> str:
    """Normalize a topic and reject prompt-like or unusual input."""
    if not isinstance(value, str):
        raise TopicValidationError("Research topic is required.")

    normalized = " ".join(
        unicodedata.normalize("NFKC", value).strip().split()
    )
    if not normalized:
        raise TopicValidationError("Research topic is required.")
    if len(normalized) > MAX_TOPIC_LENGTH:
        raise TopicValidationError(
            f"Research topic must be {MAX_TOPIC_LENGTH} characters or fewer."
        )
    if any(
        unicodedata.category(character) in _CONTROL_OR_FORMAT_CATEGORIES
        for character in normalized
    ):
        raise TopicValidationError(
            "Research topic contains unsupported invisible characters."
        )
    if any(pattern.search(normalized) for pattern in _PROMPT_INJECTION_PATTERNS):
        raise TopicValidationError(
            "Enter a research subject only; instruction-like text is not allowed."
        )
    if any(
        not (character.isalnum() or character.isspace() or character in _ALLOWED_TOPIC_CHARACTERS)
        for character in normalized
    ):
        raise TopicValidationError(
            "Use words, numbers, spaces, and common research punctuation only."
        )

    return normalized