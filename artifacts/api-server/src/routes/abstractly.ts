import {
  ListScoredPapersResponse,
  SavePaperFeedbackBody,
  SavePaperFeedbackResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { abstractlyDatabase } from "../lib/abstractly-sqlite";

const router: IRouter = Router();

router.get("/abstractly/papers", async (req, res): Promise<void> => {
  try {
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
            feedback.thumbs_up_down AS feedback
          FROM papers
          INNER JOIN research_topics
            ON research_topics.id = 1
            AND research_topics.topic = papers.topic
          LEFT JOIN feedback ON feedback.paper_id = papers.paper_id
          ORDER BY papers.relevance_score DESC, papers.scored_at DESC
        `,
      )
      .all();

    res.json(ListScoredPapersResponse.parse(rows));
  } catch (error) {
    req.log.error({ error }, "Unable to list Abstractly papers");
    res.status(500).json({ error: "Unable to load scored papers." });
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

export default router;