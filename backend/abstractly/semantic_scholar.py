"""Small client for the public Semantic Scholar Graph API."""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


_MIN_REQUEST_INTERVAL_SECONDS = 1.0
_REQUEST_RATE_LIMIT_LOCK = threading.Lock()
_LAST_REQUEST_STARTED_AT = 0.0


@dataclass(frozen=True, slots=True)
class ResearchPaper:
    """A paper returned by Semantic Scholar."""

    title: str
    abstract: str | None
    year: int | None
    url: str | None


class SemanticScholarError(RuntimeError):
    """Raised when Semantic Scholar cannot be queried successfully."""


class SemanticScholarClient:
    """Fetch recent papers matching a research topic."""

    BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
    DEFAULT_FIELDS = ("title", "abstract", "year", "url")

    def __init__(
        self,
        timeout: float = 30.0,
        api_key: str | None = None,
    ) -> None:
        self.timeout = timeout
        self.api_key = api_key or os.environ.get("SEMANTIC_SCHOLAR_API_KEY")

    @staticmethod
    def _wait_for_rate_limit() -> None:
        """Ensure request start times are at least one second apart."""
        global _LAST_REQUEST_STARTED_AT

        with _REQUEST_RATE_LIMIT_LOCK:
            elapsed = time.monotonic() - _LAST_REQUEST_STARTED_AT
            if elapsed < _MIN_REQUEST_INTERVAL_SECONDS:
                time.sleep(_MIN_REQUEST_INTERVAL_SECONDS - elapsed)
            _LAST_REQUEST_STARTED_AT = time.monotonic()

    def search_papers(
        self,
        topic: str,
        *,
        limit: int = 10,
    ) -> list[ResearchPaper]:
        """Return up to ``limit`` papers for ``topic``."""
        normalized_topic = topic.strip()
        if not normalized_topic:
            raise ValueError("Research topic cannot be empty.")
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100.")

        query = urlencode(
            {
                "query": normalized_topic,
                "limit": limit,
                "fields": ",".join(self.DEFAULT_FIELDS),
                "sort": "publicationDate:desc",
            }
        )
        headers: dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": "Abstractly/0.1",
        }
        if self.api_key:
            headers["x-api-key"] = self.api_key

        request = Request(
            f"{self.BASE_URL}?{query}",
            headers=headers,
            method="GET",
        )

        try:
            self._wait_for_rate_limit()
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.load(response)
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace").strip()
            message = f"Semantic Scholar returned HTTP {error.code}"
            if detail:
                message = f"{message}: {detail}"
            raise SemanticScholarError(message) from error
        except (URLError, TimeoutError) as error:
            raise SemanticScholarError(
                f"Could not reach Semantic Scholar: {error}"
            ) from error
        except json.JSONDecodeError as error:
            raise SemanticScholarError(
                "Semantic Scholar returned invalid JSON."
            ) from error

        raw_papers = payload.get("data", [])[:limit]
        return [
            ResearchPaper(
                title=paper.get("title") or "Untitled paper",
                abstract=paper.get("abstract"),
                year=paper.get("year"),
                url=paper.get("url"),
            )
            for paper in raw_papers
        ]