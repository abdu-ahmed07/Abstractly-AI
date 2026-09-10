const MAX_TOPIC_LENGTH = 200;
const ALLOWED_TOPIC_CHARACTER = /^[\p{L}\p{N}\s&+.,:;/'()\-#]$/u;
const CONTROL_OR_FORMAT_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;

const PROMPT_INJECTION_PATTERNS = [
  /\bignore(?:\s+(?:all|any|the))?\s+(?:(?:previous|prior|above|earlier)\s+)?instructions?\b/i,
  /\b(?:disregard|override|forget|bypass)\b.{0,40}\b(?:instructions?|rules?|prompt|system\s+message)\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\b(?:reveal|show|print|repeat|output)\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\bdo\s+not\s+follow\b/i,
] as const;

export class TopicValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopicValidationError";
  }
}

export function sanitizeResearchTopic(value: unknown): string {
  if (typeof value !== "string") {
    throw new TopicValidationError("Research topic is required.");
  }

  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized) {
    throw new TopicValidationError("Research topic is required.");
  }
  if (normalized.length > MAX_TOPIC_LENGTH) {
    throw new TopicValidationError(
      `Research topic must be ${MAX_TOPIC_LENGTH} characters or fewer.`,
    );
  }
  if (CONTROL_OR_FORMAT_CHARACTER.test(normalized)) {
    throw new TopicValidationError(
      "Research topic contains unsupported invisible characters.",
    );
  }
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new TopicValidationError(
      "Enter a research subject only; instruction-like text is not allowed.",
    );
  }
  if (
    [...normalized].some(
      (character) => !ALLOWED_TOPIC_CHARACTER.test(character),
    )
  ) {
    throw new TopicValidationError(
      "Use words, numbers, spaces, and common research punctuation only.",
    );
  }

  return normalized;
}