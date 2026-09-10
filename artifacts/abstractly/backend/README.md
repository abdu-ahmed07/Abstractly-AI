# Abstractly backend

Abstractly is a small research paper discovery backend. The script processes
each registered user's research topic through the Semantic Scholar Graph API,
asks Gemini to score each paper's relevance, and emails qualifying results to
that user's address.

## Run it

From the `backend` directory:

```bash
python main.py
```

If no users have registered through the web signup form, the script uses this
test fallback from `main.py`:

```python
RESEARCH_TOPIC = "large language models"
```

The client reads the API key from `SEMANTIC_SCHOLAR_API_KEY` and sends it in the
`x-api-key` HTTP header.
Each request attempt waits one second before starting, and HTTP 429 responses
are retried up to three times with a two-second backoff:

```bash
export SEMANTIC_SCHOLAR_API_KEY="your-key"
python main.py
```

Gemini reads its API key from `GEMINI_API_KEY`:

```bash
export GEMINI_API_KEY="your-key"
python main.py
```

Gemini uses the supported `google-genai` Python SDK with `gemini-3.6-flash` and
is asked to return a JSON object containing a
0–100 relevance score and a short rationale. API failures and malformed JSON
are shown as unavailable scores instead of being treated as real relevance
results. Research topics are normalized and validated before storage, and the
scorer sends topic and paper metadata as JSON data under a fixed system
instruction so values cannot add model instructions. Scoring calls are spaced
at least one second apart. Do not commit either key to the project.

Scored papers with a score of 50 or higher that remain pending are sent as a
simple HTML digest through Resend to each registered user's email. If there are
no registered users, the current test recipient is `delivered@resend.dev`. The
sender remains `onboarding@resend.dev`, and the app link is the placeholder
`https://example.com/abstractly`; update these constants after deployment.

Email delivery is tracked separately for every subscription and paper. Resend
must return a message ID before a paper is marked delivered. HTTP failures and
network errors remain pending with their latest error and are retried
automatically the next time `python main.py` runs.

On first run, Abstractly automatically creates `abstractly.db` in this
directory. It stores registered users and topics, successfully scored papers,
per-subscription email delivery state, and feedback used by the web interface.
Papers already scored for a topic are not rescored on later runs, but any
undelivered papers remain eligible for email retries. Users sharing a topic
reuse that topic's scoring results while retaining independent delivery state.

## Structure

```text
backend/
├── abstractly/
│   ├── __init__.py
│   ├── database.py          # SQLite user, topic, paper, and feedback persistence
│   ├── email_digest.py      # Resend HTML digest delivery
│   ├── gemini_scorer.py      # Gemini relevance scoring and validation
│   └── semantic_scholar.py  # API client and paper model
├── main.py                   # runnable entry point
├── pyproject.toml
├── tests/
└── README.md
```

The Semantic Scholar client and Gemini scorer are isolated from the entry point
so storage, scheduling, and email delivery can be added without putting those
concerns in the console script.