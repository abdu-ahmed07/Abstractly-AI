"""Abstractly research paper discovery backend."""

from .gemini_scorer import (
    GeminiRelevanceScorer,
    GeminiScoringError,
    ScoredResearchPaper,
)
from .database import AbstractlyDatabase, DatabaseError
from .email_digest import ResendEmailClient, ResendEmailError, build_digest_html
from .semantic_scholar import ResearchPaper, SemanticScholarClient

__all__ = [
    "AbstractlyDatabase",
    "DatabaseError",
    "GeminiRelevanceScorer",
    "GeminiScoringError",
    "ResearchPaper",
    "ResendEmailClient",
    "ResendEmailError",
    "ScoredResearchPaper",
    "SemanticScholarClient",
    "build_digest_html",
]