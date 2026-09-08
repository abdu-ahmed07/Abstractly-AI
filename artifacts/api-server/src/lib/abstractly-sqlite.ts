import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = path.resolve(
  moduleDir,
  "../../abstractly/backend/abstractly.db",
);

export const abstractlyDatabase = new DatabaseSync(
  process.env.ABSTRACTLY_DB_PATH ?? defaultDatabasePath,
);

abstractlyDatabase.exec(`
  CREATE TABLE IF NOT EXISTS research_topics (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    topic TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS papers (
    paper_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    year INTEGER,
    url TEXT,
    relevance_score INTEGER NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
    rationale TEXT NOT NULL,
    scored_at TEXT NOT NULL,
    PRIMARY KEY (paper_id, topic)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    paper_id TEXT PRIMARY KEY,
    thumbs_up_down INTEGER
  );
`);