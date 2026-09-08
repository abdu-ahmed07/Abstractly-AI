"""Fetch and print recent papers for Abstractly's starter topic."""

from __future__ import annotations

from abstractly.database import AbstractlyDatabase, DatabaseError
from abstractly.gemini_scorer import GeminiRelevanceScorer, GeminiScoringError
from abstractly.semantic_scholar import (
    SemanticScholarClient,
    SemanticScholarError,
)


# Replace this value as the project grows into a configurable research feed.
RESEARCH_TOPIC = "large language models"
PAPER_LIMIT = 10


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


if __name__ == "__main__":
    main()