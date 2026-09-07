"""Fetch and print recent papers for Abstractly's starter topic."""

from __future__ import annotations

import os

from abstractly.semantic_scholar import (
    SemanticScholarClient,
    SemanticScholarError,
)


# Replace this value as the project grows into a configurable research feed.
RESEARCH_TOPIC = "large language models"
PAPER_LIMIT = 10


def main() -> None:
    client = SemanticScholarClient(
        api_key=os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    )

    try:
        papers = client.search_papers(RESEARCH_TOPIC, limit=PAPER_LIMIT)
    except (SemanticScholarError, ValueError) as error:
        print(f"Unable to fetch papers: {error}")
        return

    print(f"Recent papers matching: {RESEARCH_TOPIC}")
    print("=" * 80)

    if not papers:
        print("No matching papers found.")
        return

    for index, paper in enumerate(papers, start=1):
        print(f"\n{index}. {paper.title}")
        if paper.year is not None:
            print(f"Year: {paper.year}")
        print(f"Abstract: {paper.abstract or 'No abstract available.'}")
        if paper.url:
            print(f"URL: {paper.url}")


if __name__ == "__main__":
    main()