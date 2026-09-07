# Abstractly backend

Abstractly is a small research paper discovery backend. The script queries the
public Semantic Scholar Graph API for a hardcoded topic, asks Gemini to score
each paper's relevance, and prints the results from highest to lowest score.

## Run it

From the `backend` directory:

```bash
python main.py
```

The topic is defined near the top of `main.py`:

```python
RESEARCH_TOPIC = "large language models"
```

Change that string to try another research area. The client reads the API key
from `SEMANTIC_SCHOLAR_API_KEY` and sends it in the `x-api-key` HTTP header.
Requests are throttled to one per second to stay within the key's rate limit:

```bash
export SEMANTIC_SCHOLAR_API_KEY="your-key"
python main.py
```

Gemini reads its API key from `GEMINI_API_KEY`:

```bash
export GEMINI_API_KEY="your-key"
python main.py
```

Gemini uses `gemini-3.6-flash` and is asked to return a JSON object containing a
0–100 relevance score and a short rationale. API failures and malformed JSON
are shown as unavailable scores instead of being treated as real relevance
results. Do not commit either key to the project.

## Structure

```text
backend/
├── abstractly/
│   ├── __init__.py
│   ├── gemini_scorer.py      # Gemini relevance scoring and validation
│   └── semantic_scholar.py  # API client and paper model
├── main.py                   # runnable entry point
├── pyproject.toml
└── README.md
```

The Semantic Scholar client and Gemini scorer are isolated from the entry point
so storage, scheduling, and email delivery can be added without putting those
concerns in the console script.