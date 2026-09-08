"""HTML digest delivery through the Resend API."""

from __future__ import annotations

import json
import os
from html import escape
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .gemini_scorer import ScoredResearchPaper


RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_SENDER = "onboarding@resend.dev"
DEFAULT_RECIPIENT = "delivered@resend.dev"
DEFAULT_APP_URL = "https://example.com/abstractly"
DEFAULT_RELEVANCE_THRESHOLD = 50


class ResendEmailError(RuntimeError):
    """Raised when the Resend API cannot deliver a digest."""


class ResendEmailClient:
    """Send one HTML research digest through Resend."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        sender: str = DEFAULT_SENDER,
        recipient: str = DEFAULT_RECIPIENT,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("RESEND_API_KEY")
        if not self.api_key:
            raise ResendEmailError(
                "RESEND_API_KEY is not set. Add it to the environment before sending email."
            )
        self.sender = sender
        self.recipient = recipient
        self.timeout = timeout

    def send_digest(
        self,
        topic: str,
        assessments: list[ScoredResearchPaper],
        *,
        app_url: str = DEFAULT_APP_URL,
        relevance_threshold: int = DEFAULT_RELEVANCE_THRESHOLD,
    ) -> str:
        """Send qualifying assessments and return Resend's message ID."""
        qualifying = [
            assessment
            for assessment in assessments
            if assessment.relevance_score is not None
            and assessment.relevance_score >= relevance_threshold
        ]
        if not qualifying:
            raise ResendEmailError(
                "No papers meet the relevance threshold for the email digest."
            )

        payload = {
            "from": self.sender,
            "to": [self.recipient],
            "subject": f"Abstractly digest: {topic}",
            "html": build_digest_html(topic, qualifying, app_url=app_url),
        }
        request = Request(
            RESEND_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Abstractly/0.1",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                response_payload = json.load(response)
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace").strip()
            message = f"Resend returned HTTP {error.code}"
            if detail:
                message = f"{message}: {detail}"
            raise ResendEmailError(message) from error
        except (URLError, TimeoutError) as error:
            raise ResendEmailError(f"Could not reach Resend: {error}") from error
        except json.JSONDecodeError as error:
            raise ResendEmailError("Resend returned invalid JSON.") from error

        message_id = response_payload.get("id")
        if not isinstance(message_id, str) or not message_id:
            raise ResendEmailError("Resend returned no email message ID.")
        return message_id


def build_digest_html(
    topic: str,
    assessments: list[ScoredResearchPaper],
    *,
    app_url: str = DEFAULT_APP_URL,
    snippet_length: int = 240,
) -> str:
    """Build a simple escaped table email for already-filtered assessments."""
    rows = []
    for assessment in assessments:
        paper = assessment.paper
        title = escape(paper.title)
        if paper.url:
            title = f'<a href="{escape(paper.url, quote=True)}">{title}</a>'
        abstract = _short_snippet(paper.abstract, snippet_length)
        rows.append(
            "<tr>"
            f"<td style=\"padding:12px;border-bottom:1px solid #e5e7eb;\">{title}</td>"
            f"<td style=\"padding:12px;border-bottom:1px solid #e5e7eb;\">"
            f"{escape(abstract)}</td>"
            f"<td style=\"padding:12px;border-bottom:1px solid #e5e7eb;"
            f"text-align:center;font-weight:700;\">"
            f"{assessment.relevance_score}/100</td>"
            "</tr>"
        )

    return f"""<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif;">
    <div style="max-width:900px;margin:0 auto;padding:24px;">
      <h1 style="font-size:24px;margin:0 0 8px;">Abstractly research digest</h1>
      <p style="margin:0 0 20px;color:#4b5563;">
        New papers relevant to <strong>{escape(topic)}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;
                    border:1px solid #e5e7eb;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:12px;">Paper</th>
            <th style="padding:12px;">Abstract</th>
            <th style="padding:12px;text-align:center;">Score</th>
          </tr>
        </thead>
        <tbody>
          {"".join(rows)}
        </tbody>
      </table>
      <p style="margin:20px 0 0;">
        <a href="{escape(app_url, quote=True)}">Open Abstractly</a>
      </p>
    </div>
  </body>
</html>"""


def _short_snippet(abstract: str | None, max_length: int) -> str:
    snippet = " ".join((abstract or "No abstract available.").split())
    if len(snippet) <= max_length:
        return snippet
    return f"{snippet[: max_length - 1].rstrip()}…"