# Abstractly

Abstractly is a research paper discovery app that fetches, scores, stores, displays, and gathers feedback on recent Semantic Scholar results for a research topic.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `cd artifacts/abstractly/backend && python main.py` — fetch, score, and print recent papers for the hardcoded research topic
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/abstractly/backend/main.py` — starter command-line entry point
- `artifacts/abstractly/backend/abstractly/database.py` — SQLite persistence for users, topics, scored papers, and feedback
- `artifacts/abstractly/backend/abstractly/email_digest.py` — Resend HTML digest formatting and delivery
- `artifacts/abstractly/backend/abstractly/gemini_scorer.py` — Gemini relevance scoring and response validation
- `artifacts/abstractly/backend/abstractly/semantic_scholar.py` — Semantic Scholar API client and paper model
- `artifacts/abstractly/backend/README.md` — backend setup and extension notes
- `artifacts/abstractly/src/pages/home.tsx` — scored-paper feed and no-reload feedback controls
- `artifacts/abstractly/src/pages/landing.tsx` — root welcome page with signup and login entry points
- `artifacts/abstractly/src/pages/login.tsx` — passwordless email lookup for returning subscribers
- `artifacts/abstractly/src/pages/signup.tsx` — email and research-topic subscription form
- `artifacts/api-server/src/routes/abstractly.ts` — SQLite-backed paper, feedback, and signup API
- `artifacts/api-server/src/lib/abstractly-email.ts` — immediate Resend signup confirmation delivery

## Architecture decisions

- The first backend uses Python's standard library HTTP client and reads `SEMANTIC_SCHOLAR_API_KEY` from the environment, sending it via the `x-api-key` header.
- Every Semantic Scholar attempt waits one second before starting, and HTTP 429 responses retry up to three times with a two-second backoff.
- Gemini reads `GEMINI_API_KEY`, uses `gemini-3.6-flash`, and returns validated JSON relevance scores and rationales for each fetched paper.
- Signup topics are normalized and limited to 200 characters; prompt-like phrases, invisible control characters, and unsupported punctuation are rejected before storage. Gemini receives the topic as JSON data under a fixed, non-interpolated system instruction.
- Gemini scoring request starts are spaced at least one second apart to reduce free-tier rate-limit bursts.
- A small `abstractly.db` SQLite file is created automatically; successful paper scores are deduplicated per topic, and the web interface persists thumbs up/down feedback and user-scoped Read Later saves in the same database.
- The OpenAPI-generated React client calls the shared Express API at `/api/abstractly/*`, which reads the latest subscription's topic and relevance threshold, filters scored papers, and upserts one feedback value per paper.
- Signup rows are independent email/topic subscriptions. The pipeline processes every registered user, reuses same-topic scores within a run, and addresses each digest to that row's email.
- `/` is the welcome page. `/login` resolves the most recent subscription for an email, and `/feed?email=...` loads papers for that subscription's saved topic.
- Each successful signup request immediately attempts one separate Resend confirmation email before redirecting to the feed.
- Scoring and email delivery are separate states. `email_deliveries` tracks each subscription-paper pair; only a successful Resend message ID marks it delivered, while failures remain pending for the next run.
- If the users table is empty, the pipeline preserves the original `large language models` and `delivered@resend.dev` test flow.
- Each subscription stores a relevance threshold of 50, 70, or 90. The feed and weekly HTML digest through Resend use that same per-subscription threshold; the test recipient and app URL are placeholders until deployment.
- The API clients are separated from the entry point so persistence, scheduling, and email delivery can be added without rewriting the fetch flow.

## Product

- Fetches recent papers from Semantic Scholar for a hardcoded research topic.
- Prints each result's title, Gemini relevance score, and rationale sorted by score descending.
- Skips papers already successfully scored for the current research topic.
- Sends the newly scored, high-relevance results as an email digest.
- Displays threshold-filtered scored papers in a minimal web feed with All Papers and Read Later views, bookmark save/remove controls, direct Semantic Scholar links, rationale disclosures, and no-reload feedback.
- Registers email/topic subscriptions at `/signup`, confirms by email, then redirects to `/feed?email=...`; returning users can look up the same feed from `/login`.

## Gotchas

- Semantic Scholar may return papers without abstracts; the console output handles that case explicitly.
- Gemini API failures and malformed JSON are reported per paper without inventing a relevance score.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
