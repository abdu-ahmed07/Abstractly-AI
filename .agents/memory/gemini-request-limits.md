---
name: Gemini request limits
description: External Gemini quota behavior relevant to Abstractly's paper-scoring batch.
---

Space Gemini scoring request starts by at least one second; the live free-tier
API has enforced a low per-minute request quota during verification.

**Why:** A ten-paper batch reached the Gemini free-tier quota after only a few
successful calls, even though individual calls were valid.

**How to apply:** Keep the scorer's shared throttle in place when adding
parallel scoring, retries, or larger paper batches; do not assume a full batch
can run as fast as the API responds.