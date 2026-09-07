# Abstractly backend

Abstractly is a small research paper discovery backend. The starter script
queries the public Semantic Scholar Graph API for a hardcoded topic and prints
each matching paper's title and abstract.

## Run it

From the `backend` directory:

```bash
python main.py
```

The topic is defined near the top of `main.py`:

```python
RESEARCH_TOPIC = "large language models"
```

Change that string to try another research area. The public Semantic Scholar
endpoint does not require an API key for this starter use case. If the public
rate limit is reached, provide an optional Semantic Scholar API key through the
environment:

```bash
export SEMANTIC_SCHOLAR_API_KEY="your-key"
python main.py
```

Do not commit the key to the project.

## Structure

```text
backend/
├── abstractly/
│   ├── __init__.py
│   └── semantic_scholar.py  # API client and paper model
├── main.py                   # runnable entry point
├── pyproject.toml
└── README.md
```

The client is isolated from the entry point so future work can add LLM scoring,
storage, scheduling, and email delivery without putting those concerns in the
console script.