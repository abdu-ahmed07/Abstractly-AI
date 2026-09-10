---
name: Topic input boundaries
description: The safety boundary for user-provided research topics and Gemini scoring prompts.
---

Research topics are user data, not instructions. Normalize and validate them before storage, reject prompt-like language and invisible or unsupported characters, and keep the length bounded. When scoring, interpolate no topic or paper value into the fixed system instruction; send values as a separate JSON data payload.

**Why:** A topic can reach both the research pipeline and a language model, so validation at signup alone is not enough to protect direct database or pipeline entry paths.

**How to apply:** Reuse the topic validation policy at API and Python persistence/pipeline boundaries, and keep the Gemini system instruction constant while serializing topic and paper metadata as data.