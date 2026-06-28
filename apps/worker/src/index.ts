import { Hono } from "hono";
import { handleScheduled } from "./cron";
import { handleQueue } from "./queue";
import { articlesRouter } from "./routes/articles";
import { jobsRouter } from "./routes/jobs";
import { rssRouter } from "./routes/rss";
import { sitemapRouter } from "./routes/sitemap";
import type { Bindings } from "./types";

function validateBindings(env: Bindings): void {
  if (!env.DB) throw new Error("Missing D1 Database binding 'DB'");
  if (!env.BUCKET) throw new Error("Missing R2 Bucket binding 'BUCKET'");
  if (!env.QUEUE) throw new Error("Missing Queue binding 'QUEUE'");
  if (!env.KV) throw new Error("Missing KV binding 'KV'");
  if (!env.LLM_API_KEY) {
    throw new Error(
      "Missing required Secret environment variable 'LLM_API_KEY'",
    );
  }
}

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware to validate bindings for all HTTP requests
app.use("*", async (c, next) => {
  validateBindings(c.env);
  await next();
});

// Mount routes
app.route("/", articlesRouter);
app.route("/", rssRouter);
app.route("/", sitemapRouter);
app.route("/api/jobs", jobsRouter);

export default {
  // HTTP Fetch Handler
  fetch: app.fetch,

  // Cron Trigger Handler
  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    validateBindings(env);
    ctx.waitUntil(handleScheduled(controller, env, ctx));
  },

  // Queue Consumer Handler
  async queue(
    batch: MessageBatch<any>,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    validateBindings(env);
    ctx.waitUntil(handleQueue(batch, env, ctx));
  },
};
