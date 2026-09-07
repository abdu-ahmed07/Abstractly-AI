"""Abstractly research paper discovery backend."""

from .semantic_scholar import ResearchPaper, SemanticScholarClient

__all__ = ["ResearchPaper", "SemanticScholarClient"]