---
name: Gemini Flash model retirement
description: Compatibility guidance for choosing the Gemini Flash model used by Abstractly.
---

Do not restore `gemini-2.0-flash`; use the current Flash model recommended by
the live Gemini API and verify it with a small structured-output request.

**Why:** The live API rejects Gemini 2.0 Flash as retired and identifies
Gemini 3.6 Flash as its replacement.

**How to apply:** When changing Gemini SDKs or model configuration, confirm the
configured Flash model still supports JSON response mode before running the
full paper-scoring batch.