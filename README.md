# Abstractly

Abstractly is a research paper discovery app. It fetches recent papers from
Semantic Scholar, scores their relevance with Gemini, stores successful scores
in SQLite, presents them in a focused web feed with thumbs-up/down feedback, and
emails a digest of newly scored high-relevance papers through Resend.

## Run

```bash
cd artifacts/abstractly/backend
python main.py
```

The Replit `Abstractly` web and `API Server` workflows serve the interface and
its API. The web app reads scored papers from `GET /api/abstractly/papers` and
saves feedback through `POST /api/abstractly/feedback`. The `/signup` page
registers email/topic subscriptions through `POST /api/abstractly/users`, and
the `/login` page looks up returning subscribers by email.

If no users are registered, the pipeline retains its original test fallback:

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
3. Loop through registered email/topic subscriptions, or use the single-user
   test fallback when none exist.
4. Skip papers already successfully scored for each topic.
5. Validate and normalize each signup topic, rejecting prompt-like text,
   invisible control characters, unsupported punctuation, and topics over 200
   characters.
6. Ask Gemini for a relevance score from 0 to 100 and a short rationale using
   a fixed system instruction and a JSON data payload for the topic and paper.
7. Save successful assessments to SQLite.
8. Print newly scored papers sorted by relevance.
9. Email all qualifying papers still pending for each subscription.
10. Mark papers delivered only after Resend returns a message ID; failed sends
   remain pending and are retried on the next pipeline run.

## Local persistence

The first run creates `artifacts/abstractly/backend/abstractly.db`
automatically. It contains:

- `research_topics` — the current research topic
- `papers` — paper metadata, successful scores, rationales, and timestamps
- `feedback` — the latest thumbs-up (`1`) or thumbs-down (`-1`) for each paper
- `read_later` — papers saved by each subscription for later reading
- `users` — signup rows containing `id`, `email`, `topic`, `relevance_threshold`,
  and `created_at`
- `email_deliveries` — per-subscription paper delivery state, Resend message IDs,
  attempt timestamps, and the latest error for pending retries

The database file is ignored by Git. Papers whose scoring fails are not marked
as complete, so a later run can retry them.

## Email digest

The digest is sent through the Resend API only for scored papers at or above each
subscription's saved relevance threshold. Users can choose 50, 70, or 90 on the
feed page; the same setting filters the feed and the weekly digest.
Scoring and delivery are tracked separately: a failed email does not discard a
paper, and the next pipeline run retries every still-pending eligible paper.
When the users table is empty, these temporary fallback values apply:

- Recipient: `delivered@resend.dev`
- Sender: `onboarding@resend.dev`
- App link: `https://example.com/abstractly`

Update these values in `abstractly/email_digest.py` after the app is deployed
and a production sending address is available.

Signup also sends a separate one-time confirmation email immediately through
Resend. This message confirms the selected topic and is not part of the scored
paper digest pipeline.

## Web interface

The root page welcomes visitors and links to `/signup` and `/login`. A
successful signup redirects to `/feed?email=...`. Login asks only for an email,
uses the most recent matching subscription, and redirects to the same
email-addressed feed. The feed loads papers scored for that subscription's saved
topic and threshold. The feed has All Papers and Read Later views. Each result
shows its title, abstract, score, bookmark toggle, and a View paper link to the
stored Semantic Scholar page. Clicking “Why relevant” expands the Gemini
rationale alongside the score; feedback saves without reloading the page.

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

The React/Vite interface is under `artifacts/abstractly/src`, and its Express
routes are under `artifacts/api-server/src/routes`.