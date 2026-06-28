import { getSitemapAsset } from "@rust-snacks/core";
import { Hono } from "hono";
import type { Bindings } from "../types";

export const sitemapRouter = new Hono<{ Bindings: Bindings }>();

// GET /sitemap.xml
sitemapRouter.get("/sitemap.xml", async (c) => {
  try {
    const xml = await getSitemapAsset(
      c.env.DB,
      c.env.BUCKET,
      c.env.SITE_DOMAIN,
    );
    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(xml);
  } catch (error) {
    return c.text("Error generating Sitemap", 500);
  }
});

// GET /robots.txt
sitemapRouter.get("/robots.txt", (c) => {
  const robots = `User-agent: *
Allow: /
Sitemap: https://${c.req.header("host") || "rust-snacks.pages.dev"}/sitemap.xml
`;
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(robots);
});
