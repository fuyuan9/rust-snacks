import { Hono } from "hono";
import type { Bindings } from "../types";

export const jobsRouter = new Hono<{ Bindings: Bindings }>();

// POST /trigger
jobsRouter.post("/trigger", async (c) => {
  const authHeader = c.req.header("Authorization");
  const adminKey = c.env.ADMIN_API_KEY;

  if (!adminKey) {
    return c.json(
      { error: "ADMIN_API_KEY secret is not configured on the server." },
      500,
    );
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "Unauthorized. Missing token in Authorization header." },
      401,
    );
  }

  const token = authHeader.substring(7).trim();
  if (token !== adminKey) {
    return c.json({ error: "Unauthorized. Invalid token." }, 401);
  }

  // Parse optional parameters from body
  let repositoryId: number | undefined;
  try {
    const body = await c.req.json();
    if (body && typeof body.repositoryId === "number") {
      repositoryId = body.repositoryId;
    }
  } catch (e) {
    // Ignore JSON parse error, parameters are optional
  }

  if (repositoryId) {
    // Manually trigger from snapshot stage for a specific repository
    await c.env.QUEUE.send({
      type: "snapshot",
      repositoryId,
    });
    return c.json({
      status: "triggered",
      stage: "snapshot",
      repositoryId,
      time: new Date().toISOString(),
    });
  }

  // Manually trigger the full daily pipeline starting from collection
  await c.env.QUEUE.send({
    type: "candidate_collection",
  });

  return c.json({
    status: "triggered",
    stage: "candidate_collection",
    time: new Date().toISOString(),
  });
});
