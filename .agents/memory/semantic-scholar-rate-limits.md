---
name: Semantic Scholar rate limits
description: Public Semantic Scholar requests can be rate-limited in shared development environments.
---

The public Semantic Scholar Graph API can return HTTP 429 even for a small
manual request. Abstractly should keep public access as the default, surface
the error clearly, and support an optional API key through the environment for
higher-rate-limit environments.

**Why:** A live verification request was rate-limited, so a keyless integration
cannot be assumed to work on every run.

**How to apply:** Preserve the optional-key path and bounded 429 retry/backoff
when adding scheduled fetches, LLM scoring, storage, or email delivery.