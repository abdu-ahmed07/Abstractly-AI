# Abstractly

Abstractly is a backend-only research paper discovery pipeline. It fetches
recent papers from Semantic Scholar, scores their relevance with Gemini, stores
successful scores in SQLite, and emails a digest of newly scored high-relevance
papers through Resend.

## Run

```bash
cd artifacts/abstractly/backend
python main.py
```

The current research topic is defined in `main.py`:

```python
RESEARCH_TOPIC = "large language models"
```

## Environment variables

Set these values in the Replit Secrets tool or your shell:

```bash
export SEMANTIC_SCHOLAR_API_KEY="optional-semantic-scholar-key"
export GEMINI_API_KEY="your-gemini-key"
export RESEND_API_KEY="your-resend-key"
```

- `SEMANTIC_SCHOLAR_API_KEY` is optional and is sent as the `x-api-key`
  header.
- `GEMINI_API_KEY` is required to score papers. The scorer uses the current
  Gemini Flash model and validates the returned JSON score and rationale.
- `RESEND_API_KEY` is required only when at least one newly scored paper meets
  the email threshold.

## Pipeline

1. Fetch up to 10 recent papers from Semantic Scholar.
2. Wait before Semantic Scholar requests and retry HTTP 429 responses with
   bounded backoff.
3. Skip papers already successfully scored for the current topic.
4. Ask Gemini for a relevance score from 0 to 100 and a short rationale.
5. Save successful assessments to SQLite.
6. Print newly scored papers sorted by relevance.
7. Email newly scored papers with scores of 50 or higher as an HTML digest.

## Local persistence

The first run creates `artifacts/abstractly/backend/abstractly.db`
automatically. It contains:

- `research_topics` — the current research topic
- `papers` — paper metadata, successful scores, rationales, and timestamps
- `feedback` — placeholder table with `paper_id` and `thumbs_up_down`

The database file is ignored by Git. Papers whose scoring fails are not marked
as complete, so a later run can retry them.

## Email digest

The digest is sent through the Resend API only for newly scored papers with a
score of 50 or higher. Current temporary values are:

- Recipient: `delivered@resend.dev`
- Sender: `onboarding@resend.dev`
- App link: `https://example.com/abstractly`

Update these values in `abstractly/email_digest.py` after the app is deployed
and a production sending address is available.

## Project structure

```text
artifacts/abstractly/backend/
├── abstractly/
│   ├── database.py
│   ├── email_digest.py
│   ├── gemini_scorer.py
│   └── semantic_scholar.py
├── main.py
├── pyproject.toml
└── README.md
```