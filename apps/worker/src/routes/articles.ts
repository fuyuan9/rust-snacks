import { getArticleAsset, getArticlesIndexAsset } from "@rust-snacks/core";
import { DbClient } from "@rust-snacks/db";
import { Hono } from "hono";
import type { Bindings } from "../types";

export const articlesRouter = new Hono<{ Bindings: Bindings }>();

// GET /health
articlesRouter.get("/health", (c) =>
  c.json({ status: "ok", time: new Date().toISOString() }),
);

// GET /api/articles
articlesRouter.get("/api/articles", async (c) => {
  const dbClient = new DbClient(c.env.DB);
  const articles = await dbClient.getPublishedArticles();
  return c.json(
    articles.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      is_series: a.is_series,
      series_index: a.series_index,
      series_total: a.series_total,
      published_at: a.published_at,
      analyzed_at: a.analyzed_at,
      target_commit_sha: a.target_commit_sha,
    })),
  );
});

// GET /api/articles/:slug
articlesRouter.get("/api/articles/:slug", async (c) => {
  const slug = c.req.param("slug");
  const dbClient = new DbClient(c.env.DB);
  const article = await dbClient.getArticleBySlug(slug);

  if (!article || article.status !== "published") {
    return c.json({ error: "Article not found" }, 404);
  }

  return c.json(article);
});

// GET /
articlesRouter.get("/", async (c) => {
  // Try getting index from R2 first, fallback to dynamic generation via D1
  const html = await getArticlesIndexAsset(c.env.DB, c.env.BUCKET);
  c.header("Cache-Control", "no-cache, must-revalidate");
  return c.html(html);
});

// GET /articles
articlesRouter.get("/articles", async (c) => {
  return c.redirect("/");
});

// GET /articles/:slug
articlesRouter.get("/articles/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const html = await getArticleAsset(slug, c.env.DB, c.env.BUCKET);
    c.header("Cache-Control", "no-cache, must-revalidate");
    return c.html(html);
  } catch (error) {
    return c.html(
      "<h1>404 Not Found</h1><p>記事が見つかりませんでした。</p>",
      404,
    );
  }
});
