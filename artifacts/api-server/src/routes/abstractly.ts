import {
  GetFeedSettingsQueryParams,
  GetFeedSettingsResponse,
  ListScoredPapersQueryParams,
  ListScoredPapersResponse,
  LoginUserBody,
  LoginUserResponse,
  RegisterUserBody,
  RegisterUserResponse,
  SavePaperFeedbackBody,
  SavePaperFeedbackResponse,
  SetReadLaterBody,
  SetReadLaterResponse,
  UpdateFeedSettingsBody,
  UpdateFeedSettingsResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { abstractlyDatabase } from "../lib/abstractly-sqlite";
import { sendSignupConfirmation } from "../lib/abstractly-email";
import {
  sanitizeResearchTopic,
  TopicValidationError,
} from "../lib/topic-security";

const router: IRouter = Router();

router.get("/abstractly/papers", async (req, res): Promise<void> => {
  const parsed = ListScoredPapersQueryParams.safeParse({
    email:
      typeof req.query.email === "string"
        ? req.query.email.trim().toLowerCase()
        : req.query.email,
    view: req.query.view,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const user = abstractlyDatabase
      .prepare(
        `
          SELECT id, topic, relevance_threshold AS relevanceThreshold
          FROM users
          WHERE email = ? COLLATE NOCASE
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(parsed.data.email) as
      | { id: number; topic: string; relevanceThreshold: number }
      | undefined;
    if (!user) {
      res.status(404).json({ error: "No account found with that email." });
      return;
    }

    const rows = abstractlyDatabase
      .prepare(
        `
          SELECT
            papers.paper_id AS paperId,
            papers.title,
            papers.abstract,
            papers.year,
            papers.url,
            papers.relevance_score AS relevanceScore,
            papers.rationale,
            feedback.thumbs_up_down AS feedback,
            CASE
              WHEN read_later.paper_id IS NULL THEN 0
              ELSE 1
            END AS readLater
          FROM papers
          LEFT JOIN feedback ON feedback.paper_id = papers.paper_id
          LEFT JOIN read_later
            ON read_later.user_id = ?
            AND read_later.paper_id = papers.paper_id
          WHERE papers.topic = ?
            AND papers.relevance_score >= ?
            AND (? = 'all' OR read_later.paper_id IS NOT NULL)
          ORDER BY papers.relevance_score DESC, papers.scored_at DESC
        `,
      )
      .all(user.id, user.topic, user.relevanceThreshold, parsed.data.view);

    res.json(
      ListScoredPapersResponse.parse(
        (rows as Array<Record<string, unknown>>).map((row) => ({
          ...row,
          readLater: Boolean(row.readLater),
        })),
      ),
    );
  } catch (error) {
    req.log.error({ error }, "Unable to list Abstractly papers");
    res.status(500).json({ error: "Unable to load scored papers." });
  }
});

router.post("/abstractly/read-later", (req, res): void => {
  const normalizedBody = {
    email:
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : req.body.email,
    paperId: req.body.paperId,
    saved: req.body.saved,
  };
  const parsed = SetReadLaterBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({
      error: "Read Later requires a valid email, paper, and saved state.",
    });
    return;
  }

  try {
    const user = abstractlyDatabase
      .prepare(
        `
          SELECT id
          FROM users
          WHERE email = ? COLLATE NOCASE
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(parsed.data.email) as { id: number } | undefined;

    if (!user) {
      res.status(404).json({ error: "No account found with that email." });
      return;
    }

    const paper = abstractlyDatabase
      .prepare("SELECT paper_id FROM papers WHERE paper_id = ? LIMIT 1")
      .get(parsed.data.paperId);
    if (!paper) {
      res.status(404).json({ error: "Paper not found." });
      return;
    }

    if (parsed.data.saved) {
      abstractlyDatabase
        .prepare(
          `
            INSERT INTO read_later (user_id, paper_id, saved_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, paper_id) DO UPDATE SET
              saved_at = excluded.saved_at
          `,
        )
        .run(user.id, parsed.data.paperId, new Date().toISOString());
    } else {
      abstractlyDatabase
        .prepare(
          "DELETE FROM read_later WHERE user_id = ? AND paper_id = ?",
        )
        .run(user.id, parsed.data.paperId);
    }

    res.json(
      SetReadLaterResponse.parse({
        paperId: parsed.data.paperId,
        saved: parsed.data.saved,
        message: parsed.data.saved
          ? "Saved to Read Later"
          : "Removed from Read Later",
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Unable to update Read Later");
    res.status(500).json({ error: "Unable to update Read Later." });
  }
});

router.get("/abstractly/settings", (req, res): void => {
  const parsed = GetFeedSettingsQueryParams.safeParse({
    email:
      typeof req.query.email === "string"
        ? req.query.email.trim().toLowerCase()
        : req.query.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const settings = abstractlyDatabase
      .prepare(
        `
          SELECT
            email,
            topic,
            relevance_threshold AS relevanceThreshold
          FROM users
          WHERE email = ? COLLATE NOCASE
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(parsed.data.email);

    if (!settings) {
      res.status(404).json({ error: "No account found with that email." });
      return;
    }

    res.json(GetFeedSettingsResponse.parse(settings));
  } catch (error) {
    req.log.error({ error }, "Unable to load Abstractly feed settings");
    res.status(500).json({ error: "Unable to load feed settings." });
  }
});

router.patch("/abstractly/settings", (req, res): void => {
  const normalizedBody = {
    email:
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : req.body.email,
    relevanceThreshold: req.body.relevanceThreshold,
  };
  const parsed = UpdateFeedSettingsBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({
      error: "Choose a relevance threshold of 50, 70, or 90.",
    });
    return;
  }

  try {
    const user = abstractlyDatabase
      .prepare(
        `
          SELECT id
          FROM users
          WHERE email = ? COLLATE NOCASE
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(parsed.data.email) as { id: number } | undefined;

    if (!user) {
      res.status(404).json({ error: "No account found with that email." });
      return;
    }

    abstractlyDatabase
      .prepare(
        `
          UPDATE users
          SET relevance_threshold = ?
          WHERE id = ?
        `,
      )
      .run(parsed.data.relevanceThreshold, user.id);

    const settings = abstractlyDatabase
      .prepare(
        `
          SELECT
            email,
            topic,
            relevance_threshold AS relevanceThreshold
          FROM users
          WHERE id = ?
        `,
      )
      .get(user.id);

    res.json(UpdateFeedSettingsResponse.parse(settings));
  } catch (error) {
    req.log.error({ error }, "Unable to update Abstractly feed settings");
    res.status(500).json({ error: "Unable to save feed settings." });
  }
});

router.post("/abstractly/feedback", async (req, res): Promise<void> => {
  const parsed = SavePaperFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { validationErrors: parsed.error.issues },
      "Invalid Abstractly feedback",
    );
    res.status(400).json({ error: "Feedback must be a thumbs-up or thumbs-down." });
    return;
  }

  const { paperId, thumbsUpDown } = parsed.data;

  try {
    const paper = abstractlyDatabase
      .prepare("SELECT paper_id FROM papers WHERE paper_id = ? LIMIT 1")
      .get(paperId);

    if (!paper) {
      res.status(404).json({ error: "Paper not found." });
      return;
    }

    abstractlyDatabase
      .prepare(
        `
          INSERT INTO feedback (paper_id, thumbs_up_down)
          VALUES (?, ?)
          ON CONFLICT(paper_id) DO UPDATE SET
            thumbs_up_down = excluded.thumbs_up_down
        `,
      )
      .run(paperId, thumbsUpDown);

    res.json(
      SavePaperFeedbackResponse.parse({
        paperId,
        thumbsUpDown,
        message: "Feedback saved",
      }),
    );
  } catch (error) {
    req.log.error({ error, paperId }, "Unable to save Abstractly feedback");
    res.status(500).json({ error: "Unable to save feedback." });
  }
});

router.post("/abstractly/users", async (req, res): Promise<void> => {
  let topic: string;
  try {
    topic = sanitizeResearchTopic(req.body.topic);
  } catch (error) {
    if (error instanceof TopicValidationError) {
      req.log.warn({ error: error.message }, "Invalid Abstractly research topic");
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const normalizedBody = {
    email:
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : req.body.email,
    topic,
  };
  const parsed = RegisterUserBody.safeParse(normalizedBody);

  if (!parsed.success) {
    req.log.warn(
      { validationErrors: parsed.error.issues },
      "Invalid Abstractly signup",
    );
    res.status(400).json({
      error: "Enter a valid email address and a research topic.",
    });
    return;
  }

  const createdAt = new Date();

  try {
    const result = abstractlyDatabase
      .prepare(
        `
          INSERT INTO users (email, topic, created_at)
          VALUES (?, ?, ?)
        `,
      )
      .run(parsed.data.email, parsed.data.topic, createdAt.toISOString());
    const userId = Number(result.lastInsertRowid);

    try {
      const messageId = await sendSignupConfirmation(
        parsed.data.email,
        parsed.data.topic,
      );
      req.log.info(
        { userId, resendMessageId: messageId },
        "Abstractly signup confirmation accepted by Resend",
      );
    } catch (emailError) {
      req.log.error(
        { error: emailError, userId },
        "Unable to send Abstractly signup confirmation",
      );
    }

    res.status(201).json(RegisterUserResponse.parse({
      id: userId,
      email: parsed.data.email,
      topic: parsed.data.topic,
      createdAt,
    }));
  } catch (error) {
    req.log.error({ error }, "Unable to register Abstractly user");
    res.status(500).json({ error: "Unable to save your signup." });
  }
});

router.post("/abstractly/login", async (req, res): Promise<void> => {
  const normalizedBody = {
    email:
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : req.body.email,
  };
  const parsed = LoginUserBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const user = abstractlyDatabase
      .prepare(
        `
          SELECT id, email, topic, created_at AS createdAt
          FROM users
          WHERE email = ? COLLATE NOCASE
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(parsed.data.email);

    if (!user) {
      res.status(404).json({
        error: "No account found with that email — please sign up.",
      });
      return;
    }

    res.json(LoginUserResponse.parse(user));
  } catch (error) {
    req.log.error({ error }, "Unable to look up Abstractly user");
    res.status(500).json({ error: "Unable to look up your account." });
  }
});

export default router;