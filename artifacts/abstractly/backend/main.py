"""Fetch, score, and email recent papers for Abstractly subscriptions."""

from __future__ import annotations

from abstractly.database import AbstractlyDatabase, DatabaseError, RegisteredUser
from abstractly.email_digest import (
    DEFAULT_APP_URL,
    DEFAULT_RECIPIENT,
    DEFAULT_RELEVANCE_THRESHOLD,
    ResendEmailClient,
    ResendEmailError,
)
from abstractly.gemini_scorer import (
    GeminiRelevanceScorer,
    GeminiScoringError,
    ScoredResearchPaper,
)
from abstractly.semantic_scholar import (
    SemanticScholarClient,
    SemanticScholarError,
)
from abstractly.topic_security import TopicValidationError, sanitize_research_topic


RESEARCH_TOPIC = "large language models"
PAPER_LIMIT = 10
APP_URL = DEFAULT_APP_URL
RELEVANCE_THRESHOLD = DEFAULT_RELEVANCE_THRESHOLD


def main() -> None:
    try:
        database = AbstractlyDatabase()
        subscriptions = database.registered_users()
    except DatabaseError as error:
        print(f"Unable to open the Abstractly database: {error}")
        return

    if not subscriptions:
        subscriptions = [
            RegisteredUser(
                id=0,
                email=DEFAULT_RECIPIENT,
                topic=RESEARCH_TOPIC,
                created_at="",
                    relevance_threshold=RELEVANCE_THRESHOLD,
            )
        ]
        print(
            "No registered users found; running the single-user test fallback "
            f"for {DEFAULT_RECIPIENT}."
        )

    client = SemanticScholarClient()
    scorer: GeminiRelevanceScorer | None = None
    results_by_topic: dict[str, list[ScoredResearchPaper]] = {}

    for subscription in subscriptions:
        if subscription.topic not in results_by_topic:
            scored_papers, scorer = _score_topic(
                subscription.topic,
                database,
                client,
                scorer,
            )
            results_by_topic[subscription.topic] = scored_papers
        else:
            scored_papers = results_by_topic[subscription.topic]

        _print_results(subscription.topic, scored_papers)
        try:
            pending_papers = database.pending_delivery_papers(
                subscription.id,
                subscription.topic,
                relevance_threshold=subscription.relevance_threshold,
            )
        except DatabaseError as error:
            print(
                f"Unable to prepare email digest for {subscription.email}: {error}"
            )
            continue
        _send_digest(subscription, pending_papers, database)


def _score_topic(
    topic: str,
    database: AbstractlyDatabase,
    client: SemanticScholarClient,
    scorer: GeminiRelevanceScorer | None,
) -> tuple[list[ScoredResearchPaper], GeminiRelevanceScorer | None]:
    try:
        safe_topic = sanitize_research_topic(topic)
    except TopicValidationError as error:
        print(f"Unable to prepare topic {topic!r}: {error}")
        return [], scorer

    try:
        database.save_topic(safe_topic)
        already_scored = database.scored_paper_ids(safe_topic)
    except DatabaseError as error:
        print(f"Unable to prepare topic {safe_topic!r}: {error}")
        return [], scorer

    try:
        papers = client.search_papers(safe_topic, limit=PAPER_LIMIT)
    except (SemanticScholarError, ValueError) as error:
        print(f"Unable to fetch papers for {safe_topic!r}: {error}")
        return [], scorer

    if not papers:
        print(f"No matching papers found for {safe_topic!r}.")
        return [], scorer

    new_papers = [
        paper
        for paper in papers
        if database.paper_id(paper) not in already_scored
    ]
    if not new_papers:
        print(f"No new papers to score for {safe_topic!r}.")
        return [], scorer

    if scorer is None:
        try:
            scorer = GeminiRelevanceScorer()
        except GeminiScoringError as error:
            print(f"Unable to score papers for {safe_topic!r}: {error}")
            return [], None

    scored_papers: list[ScoredResearchPaper] = []
    for paper in new_papers:
        try:
            assessment = scorer.score_paper(safe_topic, paper)
        except GeminiScoringError as error:
            scored_papers.append(scorer.failed_assessment(paper, str(error)))
            continue

        try:
            database.save_scored_paper(safe_topic, assessment)
        except DatabaseError as error:
            print(f"Unable to save scored paper for {safe_topic!r}: {error}")
            continue
        scored_papers.append(assessment)

    scored_papers.sort(
        key=lambda item: (
            item.relevance_score is not None,
            item.relevance_score if item.relevance_score is not None else -1,
        ),
        reverse=True,
    )
    return scored_papers, scorer


def _print_results(topic: str, scored_papers: list[ScoredResearchPaper]) -> None:
    print(f"\nPapers ranked by Gemini relevance: {topic}")
    print("=" * 80)

    if not scored_papers:
        print("No newly scored papers.")
        return

    for index, assessment in enumerate(scored_papers, start=1):
        print(f"\n{index}. {assessment.paper.title}")
        if assessment.relevance_score is None:
            print("Relevance score: unavailable")
        else:
            print(f"Relevance score: {assessment.relevance_score}/100")
        print(f"Rationale: {assessment.rationale}")


def _send_digest(
    subscription: RegisteredUser,
    pending_papers: list[ScoredResearchPaper],
    database: AbstractlyDatabase,
) -> None:
    if not pending_papers:
        print(
            f"No email digest sent to {subscription.email}: no pending "
            f"papers at or above {subscription.relevance_threshold}/100."
        )
        return

    try:
        email_client = ResendEmailClient(recipient=subscription.email)
        message_id = email_client.send_digest(
            subscription.topic,
            pending_papers,
            app_url=APP_URL,
            relevance_threshold=subscription.relevance_threshold,
        )
    except ResendEmailError as error:
        print(f"Email digest was not sent to {subscription.email}: {error}")
        try:
            database.record_delivery_failure(
                subscription.id,
                subscription.topic,
                pending_papers,
                str(error),
            )
        except DatabaseError as database_error:
            print(
                f"Unable to record pending deliveries for "
                f"{subscription.email}: {database_error}"
            )
    else:
        try:
            database.mark_delivered(
                subscription.id,
                subscription.topic,
                pending_papers,
                message_id,
            )
        except DatabaseError as error:
            print(
                f"Resend accepted the digest for {subscription.email} "
                f"(message ID: {message_id}), but delivery state could not "
                f"be saved: {error}"
            )
            return
        print(
            f"Email digest sent to {subscription.email} "
            f"(message ID: {message_id})."
        )


if __name__ == "__main__":
    main()