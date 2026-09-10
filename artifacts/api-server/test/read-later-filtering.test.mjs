import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

const packageDirectory = new URL("..", import.meta.url);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "abstractly-api-test-"));
const databasePath = join(temporaryDirectory, "abstractly.db");
const port = await findAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;

before(async () => {
  serverProcess = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: packageDirectory,
    env: {
      ...process.env,
      ABSTRACTLY_DB_PATH: databasePath,
      NODE_ENV: "test",
      PORT: String(port),
    },
    stdio: "ignore",
  });

  await waitForHealth();
  seedDatabase();
});

after(() => {
  serverProcess?.kill();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("all papers stays threshold-filtered while Read Later is user-scoped", async () => {
  const allForFirstUser = await getPapers("first@example.com", "all");
  assert.deepEqual(
    allForFirstUser.map((paper) => [paper.paperId, paper.readLater]),
    [
      ["paper-one", true],
      ["paper-two", false],
    ],
  );

  const readLaterForFirstUser = await getPapers(
    "first@example.com",
    "read_later",
  );
  assert.deepEqual(
    readLaterForFirstUser.map((paper) => paper.paperId),
    ["paper-one"],
  );

  const readLaterForSecondUser = await getPapers(
    "second@example.com",
    "read_later",
  );
  assert.deepEqual(
    readLaterForSecondUser.map((paper) => paper.paperId),
    ["paper-two"],
  );
});

test("invalid views are rejected and unsaving removes a paper from Read Later", async () => {
  const invalidViewResponse = await fetch(
    `${baseUrl}/api/abstractly/papers?email=first%40example.com&view=other`,
  );
  assert.equal(invalidViewResponse.status, 400);

  const removeResponse = await fetch(`${baseUrl}/api/abstractly/read-later`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "first@example.com",
      paperId: "paper-one",
      saved: false,
    }),
  });
  assert.equal(removeResponse.status, 200);

  const readLaterAfterRemoval = await getPapers(
    "first@example.com",
    "read_later",
  );
  assert.deepEqual(readLaterAfterRemoval, []);
});

async function getPapers(email, view) {
  const response = await fetch(
    `${baseUrl}/api/abstractly/papers?email=${encodeURIComponent(email)}&view=${view}`,
  );
  assert.equal(response.status, 200);
  return response.json();
}

function seedDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    INSERT INTO users (email, topic, created_at)
    VALUES
      ('first@example.com', 'robotics', '2026-01-01T00:00:00.000Z'),
      ('second@example.com', 'robotics', '2026-01-01T00:00:00.000Z');

    INSERT INTO papers (
      paper_id, topic, title, abstract, year, url, relevance_score, rationale, scored_at
    )
    VALUES
      ('paper-one', 'robotics', 'Paper One', 'First abstract', 2026, 'https://example.com/one', 90, 'Highly relevant', '2026-01-01T00:00:00.000Z'),
      ('paper-two', 'robotics', 'Paper Two', 'Second abstract', 2026, 'https://example.com/two', 80, 'Highly relevant', '2026-01-02T00:00:00.000Z'),
      ('paper-three', 'robotics', 'Paper Three', 'Third abstract', 2026, 'https://example.com/three', 40, 'Below threshold', '2026-01-03T00:00:00.000Z');

    INSERT INTO read_later (user_id, paper_id, saved_at)
    VALUES
      (1, 'paper-one', '2026-01-04T00:00:00.000Z'),
      (2, 'paper-two', '2026-01-04T00:00:00.000Z');
  `);
  database.close();
}

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("API server did not become ready");
}

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const availablePort = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return availablePort;
}