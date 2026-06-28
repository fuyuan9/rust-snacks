import { ArticleGenerator, selectTopRepository } from "@rust-snacks/core";
import { DbClient } from "@rust-snacks/db";
import { SnapshotTaker } from "@rust-snacks/github";
import { Hono } from "hono";
import type { Bindings } from "../types";

export const debugRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/debug/generate
debugRouter.get("/generate", async (c) => {
  const adminKey = c.env.ADMIN_API_KEY;
  if (!adminKey) {
    return c.json(
      { error: "ADMIN_API_KEY secret is not configured on the server." },
      500,
    );
  }

  // Support key authentication via query parameter or Authorization header
  const authQuery = c.req.query("key");
  const authHeader = c.req.header("Authorization");
  let requestKey = "";

  if (authQuery) {
    requestKey = authQuery.trim();
  } else if (authHeader?.startsWith("Bearer ")) {
    requestKey = authHeader.substring(7).trim();
  }

  if (requestKey !== adminKey) {
    return c.json({ error: "Unauthorized. Invalid debug key." }, 401);
  }

  const dbClient = new DbClient(c.env.DB);
  const githubToken = c.env.GITHUB_TOKEN;
  const llmApiKey = c.env.LLM_API_KEY;

  if (!llmApiKey) {
    return c.json({ error: "LLM_API_KEY secret is missing." }, 500);
  }

  // 1. Resolve repository
  const repoIdStr = c.req.query("repoId");
  const repoId: number | null = repoIdStr
    ? Number.parseInt(repoIdStr, 10)
    : null;
  let repo = null;

  if (repoId) {
    repo = await dbClient.getRepository(repoId);
  } else {
    // Automatically select top repository if not specified
    repo = await selectTopRepository(dbClient);
  }

  if (!repo) {
    return c.json({ error: "No eligible repository found to analyze." }, 404);
  }

  console.log(
    `[Debug API] Selected repository: ${repo.owner}/${repo.name} (ID: ${repo.id})`,
  );

  try {
    // 2. Synchronous Snapshot
    const taker = new SnapshotTaker(githubToken);
    const commitSha = await taker.takeSnapshot(
      dbClient,
      c.env.BUCKET,
      repo.id,
      repo.owner,
      repo.name,
    );

    console.log(
      `[Debug API] Created snapshot for ${repo.owner}/${repo.name} at commit ${commitSha}`,
    );

    const snapshot = await dbClient.getLatestSnapshot(repo.id);
    if (!snapshot) {
      throw new Error(`Snapshot not found for repository: ${repo.id}`);
    }

    // 3. Synchronous Article Generation
    const generator = new ArticleGenerator(
      llmApiKey,
      c.env.LLM_PROVIDER,
      c.env.LLM_MODEL,
    );

    const articleId = await generator.generateArticle(
      dbClient,
      c.env.BUCKET,
      repo,
      commitSha,
      snapshot,
    );

    // Retrieve generated article slug to perform redirect
    const { results } = await c.env.DB.prepare(
      "SELECT slug FROM articles WHERE id = ?",
    )
      .bind(articleId)
      .all<{ slug: string }>();

    const slug = results?.[0]?.slug;

    if (!slug) {
      return c.json({
        status: "success",
        message: "Article generated but slug could not be retrieved.",
        articleId,
      });
    }

    console.log(
      `[Debug API] Article successfully generated: /articles/${slug}`,
    );

    // Redirect browser directly to the newly generated article
    return c.redirect(`/articles/${slug}`);
  } catch (err: any) {
    console.error("[Debug API] Failed to generate article:", err);
    return c.json(
      {
        error: "Failed to generate article",
        details: err.message,
      },
      500,
    );
  }
});
