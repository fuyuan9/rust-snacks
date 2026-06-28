import { DbClient } from "@rust-snacks/db";
import type { Bindings } from "./types";

export async function handleScheduled(
  controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const dbClient = new DbClient(env.DB);

  // Check if there is any pending series article in stock to publish
  const pendingArticle = await dbClient.getLatestPendingSeriesArticle();
  if (pendingArticle) {
    console.log(
      `Found pending series article in stock: ID ${pendingArticle.id}, Title "${pendingArticle.title}". Publishing instead of starting new job.`,
    );

    // 1. Publish the article in D1
    await dbClient.publishArticle(pendingArticle.id);

    // 2. Put the generated HTML in R2
    await env.BUCKET.put(
      `articles/${pendingArticle.slug}.html`,
      pendingArticle.body_html,
      {
        httpMetadata: { contentType: "text/html" },
      },
    );

    // 3. Clear R2 cache files to trigger rebuild on next access
    await env.BUCKET.delete("index.html");
    await env.BUCKET.delete("rss.xml");
    await env.BUCKET.delete("sitemap.xml");

    console.log(
      `Successfully published stocked series article: ${pendingArticle.slug}`,
    );
    return; // Early termination, skip new candidate collection
  }

  // Push the initial collect message to the queue to kick off the pipeline
  await env.QUEUE.send({
    type: "candidate_collection",
  });
  console.log("Cron triggered: Pushed candidate_collection message to Queue.");
}
