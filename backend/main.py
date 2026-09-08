"""Fetch and print recent papers for Abstractly's starter topic."""

from __future__ import annotations

from abstractly.database import AbstractlyDatabase, DatabaseError
from abstractly.email_digest import (
    DEFAULT_APP_URL,
    DEFAULT_RELEVANCE_THRESHOLD,
    DEFAULT_RECIPIENT,
    ResendEmailClient,
    ResendEmailError,
)
from abstractly.gemini_scorer import GeminiRelevanceScorer, GeminiScoringError
from abstractly.semantic_scholar import (
    SemanticScholarClient,
    SemanticScholarError,
)


# Replace this value as the project grows into a configurable research feed.
RESEARCH_TOPIC = "large language models"
PAPER_LIMIT = 10
APP_URL = DEFAULT_APP_URL
RELEVANCE_THRESHOLD = DEFAULT_RELEVANCE_THRESHOLD


def main() -> None:
    try:
        database = AbstractlyDatabase()
        database.save_topic(RESEARCH_TOPIC)
        already_scored = database.scored_paper_ids(RESEARCH_TOPIC)
    except DatabaseError as error:
        print(f"Unable to open the Abstractly database: {error}")
        return

    client = SemanticScholarClient()

    try:
        papers = client.search_papers(RESEARCH_TOPIC, limit=PAPER_LIMIT)
    except (SemanticScholarError, ValueError) as error:
        print(f"Unable to fetch papers: {error}")
        return

    new_papers = [
        paper
        for paper in papers
        if database.paper_id(paper) not in already_scored
    ]

    print(f"Papers ranked by Gemini relevance: {RESEARCH_TOPIC}")
    print("=" * 80)

    if not papers:
        print("No matching papers found.")
        return

    if not new_papers:
        print("No new papers to score.")
        return

    try:
        scorer = GeminiRelevanceScorer()
    except GeminiScoringError as error:
        print(f"Unable to score papers: {error}")
        return

    scored_papers = []
    for paper in new_papers:
        try:
            assessment = scorer.score_paper(RESEARCH_TOPIC, paper)
        except GeminiScoringError as error:
            scored_papers.append(
                scorer.failed_assessment(paper, str(error))
            )
        else:
            try:
                database.save_scored_paper(RESEARCH_TOPIC, assessment)
            except DatabaseError as error:
                print(f"Unable to save scored paper: {error}")
                return
            scored_papers.append(assessment)

    scored_papers.sort(
        key=lambda item: (
            item.relevance_score is not None,
            item.relevance_score if item.relevance_score is not None else -1,
        ),
        reverse=True,
    )

    if not scored_papers:
        print("No matching papers found.")
        return

    for index, assessment in enumerate(scored_papers, start=1):
        print(f"\n{index}. {assessment.paper.title}")
        if assessment.relevance_score is None:
            print("Relevance score: unavailable")
        else:
            print(f"Relevance score: {assessment.relevance_score}/100")
        print(f"Rationale: {assessment.rationale}")

    digest_papers = [
        assessment
        for assessment in scored_papers
        if assessment.relevance_score is not None
        and assessment.relevance_score >= RELEVANCE_THRESHOLD
    ]
    if not digest_papers:
        print(
            f"\nNo email digest sent: no newly scored papers reached "
            f"{RELEVANCE_THRESHOLD}/100."
        )
        return

    try:
        email_client = ResendEmailClient()
        message_id = email_client.send_digest(
            RESEARCH_TOPIC,
            digest_papers,
            app_url=APP_URL,
            relevance_threshold=RELEVANCE_THRESHOLD,
        )
    except ResendEmailError as error:
        print(f"\nEmail digest was not sent: {error}")
    else:
        print(
            f"\nEmail digest sent to {DEFAULT_RECIPIENT} "
            f"(message ID: {message_id})."
        )


if __name__ == "__main__":
    main()