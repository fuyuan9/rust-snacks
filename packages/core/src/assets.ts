import type { R2Bucket } from "@cloudflare/workers-types";
import type { Article, DbClient } from "@rust-snacks/db";
import { renderArticleList } from "@rust-snacks/renderer";

export async function getArticleAsset(
  slug: string,
  db: any,
  r2Bucket: R2Bucket,
): Promise<string> {
  const r2Key = `articles/${slug}.html`;

  // 1. Try R2
  try {
    const obj = await r2Bucket.get(r2Key);
    if (obj) {
      return await obj.text();
    }
  } catch (e) {
    // Ignore R2 error and fallback
  }

  // 2. Try D1 fallback
  const { DbClient } = await import("@rust-snacks/db");
  const dbClient = new DbClient(db);
  const article = await dbClient.getArticleBySlug(slug);

  if (!article || article.status !== "published") {
    throw new Error("Article not found or not published");
  }

  // Re-save to R2 for caching
  await r2Bucket.put(r2Key, article.body_html);
  return article.body_html;
}

export async function getArticlesIndexAsset(
  db: any,
  r2Bucket: R2Bucket,
): Promise<string> {
  const r2Key = "index.html";
  try {
    const obj = await r2Bucket.get(r2Key);
    if (obj) return await obj.text();
  } catch (e) {}

  // Generate dynamically
  const { DbClient } = await import("@rust-snacks/db");
  const dbClient = new DbClient(db);
  const articles = await dbClient.getPublishedArticles();

  const listItems = articles.map((a) => {
    let description = "";
    try {
      const seo = JSON.parse(a.seo_json || "{}");
      description = seo.description || "";
    } catch (e) {}

    return {
      title: a.title,
      slug: a.slug,
      description,
      published_at: a.published_at || a.analyzed_at,
      is_series: a.is_series === 1,
      series_index: a.series_index,
      series_total: a.series_total,
    };
  });

  const html = renderArticleList(listItems);
  await r2Bucket.put(r2Key, html);
  return html;
}

export async function getRSSAsset(
  db: any,
  r2Bucket: R2Bucket,
  siteDomain = "rust-snacks.pages.dev",
): Promise<string> {
  const r2Key = "rss.xml";
  try {
    const obj = await r2Bucket.get(r2Key);
    if (obj) return await obj.text();
  } catch (e) {}

  // Generate
  const { DbClient } = await import("@rust-snacks/db");
  const dbClient = new DbClient(db);
  const articles = await dbClient.getPublishedArticles();

  const items = articles
    .map((a) => {
      let description = "";
      try {
        const seo = JSON.parse(a.seo_json || "{}");
        description = seo.description || "";
      } catch (e) {}

      return `
    <item>
      <title>${escapeXml(a.title)}</title>
      <link>https://${siteDomain}/articles/${a.slug}</link>
      <guid>https://${siteDomain}/articles/${a.slug}</guid>
      <pubDate>${new Date(a.published_at || a.analyzed_at).toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Rust Snacks</title>
    <link>https://${siteDomain}</link>
    <description>Rustの設計と実装Tipsを学ぶ</description>
    <language>ja</language>
    ${items}
  </channel>
</rss>`;

  await r2Bucket.put(r2Key, xml);
  return xml;
}

export async function getSitemapAsset(
  db: any,
  r2Bucket: R2Bucket,
  siteDomain = "rust-snacks.pages.dev",
): Promise<string> {
  const r2Key = "sitemap.xml";
  try {
    const obj = await r2Bucket.get(r2Key);
    if (obj) return await obj.text();
  } catch (e) {}

  // Generate
  const { DbClient } = await import("@rust-snacks/db");
  const dbClient = new DbClient(db);
  const articles = await dbClient.getPublishedArticles();

  const urls = articles
    .map(
      (a) => `
  <url>
    <loc>https://${siteDomain}/articles/${a.slug}</loc>
    <lastmod>${new Date(a.published_at || a.analyzed_at).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${siteDomain}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${urls}
</urlset>`;

  await r2Bucket.put(r2Key, xml);
  return xml;
}

export async function saveArticleAssets(
  slug: string,
  html: string,
  dbClient: any,
  r2Bucket: R2Bucket,
): Promise<void> {
  // Save specific article
  await r2Bucket.put(`articles/${slug}.html`, html);

  // Invalidate / regenerate indexes, RSS, sitemap by deleting them from R2
  // Next time they are requested, they will be dynamically generated and cached.
  await r2Bucket.delete("index.html");
  await r2Bucket.delete("rss.xml");
  await r2Bucket.delete("sitemap.xml");
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
