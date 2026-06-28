import { getRSSAsset } from "@rust-snacks/core";
import { Hono } from "hono";
import type { Bindings } from "../types";

export const rssRouter = new Hono<{ Bindings: Bindings }>();

// GET /rss.xml
rssRouter.get("/rss.xml", async (c) => {
  try {
    const xml = await getRSSAsset(c.env.DB, c.env.BUCKET, c.env.SITE_DOMAIN);
    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(xml);
  } catch (error) {
    return c.text("Error generating RSS", 500);
  }
});
