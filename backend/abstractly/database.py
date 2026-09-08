"""Small SQLite persistence layer for Abstractly."""

from __future__ import annotations

import hashlib
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .gemini_scorer import ScoredResearchPaper
from .semantic_scholar import ResearchPaper


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "abstractly.db"


class DatabaseError(RuntimeError):
    """Raised when Abstractly cannot read or write its SQLite database."""


class AbstractlyDatabase:
    """Persist topics and successful paper assessments in one SQLite file."""

    def __init__(self, path: str | Path = DEFAULT_DATABASE_PATH) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS research_topics (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        topic TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS papers (
                        paper_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        title TEXT NOT NULL,
                        abstract TEXT,
                        year INTEGER,
                        url TEXT,
                        relevance_score INTEGER NOT NULL
                            CHECK (relevance_score BETWEEN 0 AND 100),
                        rationale TEXT NOT NULL,
                        scored_at TEXT NOT NULL,
                        PRIMARY KEY (paper_id, topic)
                    );

                    CREATE TABLE IF NOT EXISTS feedback (
                        paper_id TEXT PRIMARY KEY,
                        thumbs_up_down INTEGER
                    );
                    """
                )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(
                f"Could not initialize SQLite database at {self.path}: {error}"
            ) from error

    def save_topic(self, topic: str) -> None:
        """Store the current research topic as the single active topic."""
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.execute(
                    """
                    INSERT INTO research_topics (id, topic, updated_at)
                    VALUES (1, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        topic = excluded.topic,
                        updated_at = excluded.updated_at
                    """,
                    (topic, self._now()),
                )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(f"Could not save research topic: {error}") from error

    def scored_paper_ids(self, topic: str) -> set[str]:
        """Return paper IDs already scored for this topic."""
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                rows = connection.execute(
                    "SELECT paper_id FROM papers WHERE topic = ?",
                    (topic,),
                ).fetchall()
            return {row[0] for row in rows}
        except sqlite3.Error as error:
            raise DatabaseError(f"Could not read scored papers: {error}") from error

    def save_scored_paper(
        self,
        topic: str,
        assessment: ScoredResearchPaper,
    ) -> None:
        """Store one successful assessment for future de-duplication."""
        paper = assessment.paper
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.execute(
                    """
                    INSERT OR REPLACE INTO papers (
                        paper_id, topic, title, abstract, year, url,
                        relevance_score, rationale, scored_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self.paper_id(paper),
                        topic,
                        paper.title,
                        paper.abstract,
                        paper.year,
                        paper.url,
                        assessment.relevance_score,
                        assessment.rationale,
                        self._now(),
                    ),
                )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(f"Could not save scored paper: {error}") from error

    @staticmethod
    def paper_id(paper: ResearchPaper) -> str:
        """Return a stable ID, even for an incomplete API response."""
        if paper.paper_id:
            return paper.paper_id
        if paper.url:
            return paper.url

        fallback = f"{paper.title}\n{paper.year or ''}".encode("utf-8")
        return f"title:{hashlib.sha256(fallback).hexdigest()}"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()