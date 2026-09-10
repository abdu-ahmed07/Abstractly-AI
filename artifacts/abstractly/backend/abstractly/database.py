"""Small SQLite persistence layer for Abstractly."""

from __future__ import annotations

import hashlib
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .gemini_scorer import ScoredResearchPaper
from .semantic_scholar import ResearchPaper
from .topic_security import sanitize_research_topic


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "abstractly.db"


class DatabaseError(RuntimeError):
    """Raised when Abstractly cannot read or write its SQLite database."""


@dataclass(frozen=True)
class RegisteredUser:
    """One email subscription and its research topic."""

    id: int
    email: str
    topic: str
    created_at: str
    relevance_threshold: int = 50


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

                    CREATE TABLE IF NOT EXISTS read_later (
                        user_id INTEGER NOT NULL,
                        paper_id TEXT NOT NULL,
                        saved_at TEXT NOT NULL,
                        PRIMARY KEY (user_id, paper_id)
                    );

                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        relevance_threshold INTEGER NOT NULL DEFAULT 50
                            CHECK (relevance_threshold IN (50, 70, 90)),
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS email_deliveries (
                        user_id INTEGER NOT NULL,
                        paper_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        status TEXT NOT NULL
                            CHECK (status IN ('pending', 'delivered')),
                        attempted_at TEXT NOT NULL,
                        delivered_at TEXT,
                        resend_message_id TEXT,
                        last_error TEXT,
                        PRIMARY KEY (user_id, paper_id, topic)
                    );
                    """
                )
                user_columns = {
                    row[1]
                    for row in connection.execute("PRAGMA table_info(users)").fetchall()
                }
                if "relevance_threshold" not in user_columns:
                    connection.execute(
                        """
                        ALTER TABLE users
                        ADD COLUMN relevance_threshold INTEGER NOT NULL DEFAULT 50
                        """
                    )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(
                f"Could not initialize SQLite database at {self.path}: {error}"
            ) from error

    def save_topic(self, topic: str) -> None:
        """Store the current research topic as the single active topic."""
        safe_topic = sanitize_research_topic(topic)
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
                    (safe_topic, self._now()),
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

    def save_user(
        self,
        email: str,
        topic: str,
        relevance_threshold: int = 50,
    ) -> RegisteredUser:
        """Register one email/topic subscription and return its stored row."""
        if relevance_threshold not in (50, 70, 90):
            raise ValueError("Relevance threshold must be 50, 70, or 90.")
        safe_topic = sanitize_research_topic(topic)
        created_at = self._now()
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO users (
                        email, topic, relevance_threshold, created_at
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        email.strip().lower(),
                        safe_topic,
                        relevance_threshold,
                        created_at,
                    ),
                )
                connection.commit()
                user_id = int(cursor.lastrowid)
        except sqlite3.Error as error:
            raise DatabaseError(f"Could not save user: {error}") from error

        return RegisteredUser(
            id=user_id,
            email=email.strip().lower(),
            topic=safe_topic,
            created_at=created_at,
            relevance_threshold=relevance_threshold,
        )

    def registered_users(self) -> list[RegisteredUser]:
        """Return all registered subscriptions in signup order."""
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                rows = connection.execute(
                    """
                        SELECT id, email, topic, created_at, relevance_threshold
                    FROM users
                    ORDER BY id
                    """
                ).fetchall()
        except sqlite3.Error as error:
            raise DatabaseError(f"Could not read registered users: {error}") from error

        return [RegisteredUser(*row) for row in rows]

    def save_scored_paper(
        self,
        topic: str,
        assessment: ScoredResearchPaper,
    ) -> None:
        """Store one successful assessment for future de-duplication."""
        paper = assessment.paper
        safe_topic = sanitize_research_topic(topic)
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
                        safe_topic,
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

    def pending_delivery_papers(
        self,
        user_id: int,
        topic: str,
        *,
        relevance_threshold: int,
    ) -> list[ScoredResearchPaper]:
        """Return scored papers not yet confirmed delivered to one subscription."""
        try:
            with closing(sqlite3.connect(self.path)) as connection:
                rows = connection.execute(
                    """
                    SELECT
                        p.paper_id,
                        p.title,
                        p.abstract,
                        p.year,
                        p.url,
                        p.relevance_score,
                        p.rationale
                    FROM papers AS p
                    LEFT JOIN email_deliveries AS d
                        ON d.user_id = ?
                        AND d.paper_id = p.paper_id
                        AND d.topic = p.topic
                    WHERE p.topic = ?
                        AND p.relevance_score >= ?
                        AND (d.status IS NULL OR d.status = 'pending')
                    ORDER BY p.relevance_score DESC, p.scored_at DESC
                    """,
                    (user_id, topic, relevance_threshold),
                ).fetchall()
        except sqlite3.Error as error:
            raise DatabaseError(
                f"Could not read pending email deliveries: {error}"
            ) from error

        return [
            ScoredResearchPaper(
                paper=ResearchPaper(
                    paper_id=paper_id,
                    title=title,
                    abstract=abstract,
                    year=year,
                    url=url,
                ),
                relevance_score=relevance_score,
                rationale=rationale,
            )
            for (
                paper_id,
                title,
                abstract,
                year,
                url,
                relevance_score,
                rationale,
            ) in rows
        ]

    def record_delivery_failure(
        self,
        user_id: int,
        topic: str,
        assessments: list[ScoredResearchPaper],
        error_message: str,
    ) -> None:
        """Keep attempted papers pending and retain the latest delivery error."""
        attempted_at = self._now()
        rows = [
            (
                user_id,
                self.paper_id(assessment.paper),
                topic,
                attempted_at,
                error_message,
            )
            for assessment in assessments
        ]
        if not rows:
            return

        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.executemany(
                    """
                    INSERT INTO email_deliveries (
                        user_id, paper_id, topic, status, attempted_at,
                        delivered_at, resend_message_id, last_error
                    ) VALUES (?, ?, ?, 'pending', ?, NULL, NULL, ?)
                    ON CONFLICT(user_id, paper_id, topic) DO UPDATE SET
                        status = 'pending',
                        attempted_at = excluded.attempted_at,
                        delivered_at = NULL,
                        resend_message_id = NULL,
                        last_error = excluded.last_error
                    """,
                    rows,
                )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(
                f"Could not record failed email delivery: {error}"
            ) from error

    def mark_delivered(
        self,
        user_id: int,
        topic: str,
        assessments: list[ScoredResearchPaper],
        resend_message_id: str,
    ) -> None:
        """Mark papers delivered only after Resend confirms the request."""
        delivered_at = self._now()
        rows = [
            (
                user_id,
                self.paper_id(assessment.paper),
                topic,
                delivered_at,
                delivered_at,
                resend_message_id,
            )
            for assessment in assessments
        ]
        if not rows:
            return

        try:
            with closing(sqlite3.connect(self.path)) as connection:
                connection.executemany(
                    """
                    INSERT INTO email_deliveries (
                        user_id, paper_id, topic, status, attempted_at,
                        delivered_at, resend_message_id, last_error
                    ) VALUES (?, ?, ?, 'delivered', ?, ?, ?, NULL)
                    ON CONFLICT(user_id, paper_id, topic) DO UPDATE SET
                        status = 'delivered',
                        attempted_at = excluded.attempted_at,
                        delivered_at = excluded.delivered_at,
                        resend_message_id = excluded.resend_message_id,
                        last_error = NULL
                    """,
                    rows,
                )
                connection.commit()
        except sqlite3.Error as error:
            raise DatabaseError(
                f"Could not record successful email delivery: {error}"
            ) from error

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