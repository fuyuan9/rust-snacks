import { ArticleGenerator, selectTopRepository } from "@rust-snacks/core";
import { DbClient } from "@rust-snacks/db";
import {
  parseMarkdown,
  repairMarkdownMermaidBlocks,
  renderLayout,
} from "@rust-snacks/renderer";
import { SnapshotTaker } from "@rust-snacks/github";
import { Hono } from "hono";
import type { Bindings } from "../types";

export const debugRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/debug/generate
debugRouter.get("/api/debug/generate", async (c) => {
  // Block this endpoint in production environments
  if (c.env.ENVIRONMENT === "production") {
    return c.json(
      {
        error:
          "This endpoint is not available in production. Use POST /api/jobs/trigger instead.",
      },
      403,
    );
  }

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

// GET & POST /api/debug/repair-mermaid
debugRouter.get("/api/debug/repair-mermaid", async (c) =>
  handleRepairMermaid(c),
);
debugRouter.post("/api/debug/repair-mermaid", async (c) =>
  handleRepairMermaid(c),
);

async function handleRepairMermaid(c: any) {
  const adminKey = c.env.ADMIN_API_KEY;
  if (!adminKey) {
    return c.json(
      { error: "ADMIN_API_KEY secret is not configured on the server." },
      500,
    );
  }

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

  const r2Bucket = c.env.BUCKET;

  try {
    const queryResult = await c.env.DB.prepare(
      "SELECT id, slug, title, body_markdown, status, tags_json, seo_json, analyzed_at, target_commit_sha, repository_id FROM articles;",
    ).all();
    const articles = queryResult.results as any as {
      id: number;
      slug: string;
      title: string;
      body_markdown: string;
      status: string;
      tags_json: string;
      seo_json: string;
      analyzed_at: string;
      target_commit_sha: string;
      repository_id: number;
    }[];

    if (!articles || articles.length === 0) {
      return c.json({
        status: "success",
        message: "No articles found in database.",
      });
    }

    const report: {
      id: number;
      title: string;
      status: string;
      repaired: boolean;
    }[] = [];
    let repairCount = 0;

    for (const article of articles) {
      const originalMd = article.body_markdown;
      const repairedMd = repairMarkdownMermaidBlocks(originalMd);

      if (originalMd !== repairedMd) {
        const repo = (await c.env.DB.prepare(
          "SELECT owner, name FROM repositories WHERE id = ?;",
        )
          .bind(article.repository_id)
          .first()) as any as { owner: string; name: string } | null;

        if (!repo) {
          throw new Error(
            `Repository not found for ID: ${article.repository_id}`,
          );
        }

        const tags: string[] = JSON.parse(article.tags_json);
        const seo: { title: string; description: string; keywords: string } =
          JSON.parse(article.seo_json);
        const bodyHtml = parseMarkdown(repairedMd);

        // Form complete HTML with layout
        const completeHtml = renderLayout({
          title: seo.title,
          description: seo.description,
          keywords: seo.keywords,
          bodyHtml: `
            <article class="content-body">
              <div class="article-header">
                <h1 class="article-title">${article.title}</h1>
                <div class="meta-info">
                  <div class="meta-item">解析日: ${new Date(article.analyzed_at).toLocaleDateString("ja-JP")}</div>
                  <div class="meta-item">対象コミット: <a href="https://github.com/${repo.owner}/${repo.name}/commit/${article.target_commit_sha}" target="_blank">${article.target_commit_sha.substring(0, 7)}</a></div>
                  <div class="meta-item">リポジトリ: <a href="https://github.com/${repo.owner}/${repo.name}" target="_blank">${repo.owner}/${repo.name}</a></div>
                </div>
                <div class="tags">
                  ${tags.map((t) => `<span class="tag">${t}</span>`).join("")}
                </div>
              </div>
              ${bodyHtml}
            </article>
          `,
        });

        // Update database
        await c.env.DB.prepare(
          "UPDATE articles SET body_markdown = ?, body_html = ? WHERE id = ?;",
        )
          .bind(repairedMd, completeHtml, article.id)
          .run();

        // If published, also upload to R2
        if (article.status === "published") {
          await r2Bucket.put(`articles/${article.slug}.html`, completeHtml, {
            httpMetadata: { contentType: "text/html" },
          });
        }

        report.push({
          id: article.id,
          title: article.title,
          status: article.status,
          repaired: true,
        });
        repairCount++;
      } else {
        report.push({
          id: article.id,
          title: article.title,
          status: article.status,
          repaired: false,
        });
      }
    }

    if (repairCount > 0) {
      await r2Bucket.delete("index.html");
      await r2Bucket.delete("rss.xml");
      await r2Bucket.delete("sitemap.xml");
      console.log(
        `[Repair API] Cleared R2 index/rss/sitemap caches because ${repairCount} articles were repaired.`,
      );
    }

    return c.json({
      status: "success",
      message: `Completed database repair scan. Repaired ${repairCount} out of ${articles.length} articles.`,
      repairedCount: repairCount,
      totalCount: articles.length,
      report,
    });
  } catch (err: any) {
    console.error("[Repair API] Failed to run database repair:", err);
    return c.json(
      { error: "Failed to repair articles", details: err.message },
      500,
    );
  }
}
