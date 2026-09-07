# Abstractly AI

Abstractly helps researchers stay updated on new papers in their field. This repository contains the initial backend that searches Semantic Scholar for recent papers matching a hardcoded topic and prints each paper's title, abstract, year, and URL.

## Run the backend

From the repository root:

~~~bash
cd backend
python main.py
~~~

The starter topic is defined in backend/main.py. The Semantic Scholar client uses the public API by default and supports an optional SEMANTIC_SCHOLAR_API_KEY environment variable for higher-rate-limit environments.

## Project structure

- backend/main.py — runnable console entry point
- backend/abstractly/semantic_scholar.py — Semantic Scholar API client and paper model
- backend/pyproject.toml — Python project metadata

The backend is intentionally separated into a client and entry point so future work can add LLM scoring, storage, scheduling, and email delivery.