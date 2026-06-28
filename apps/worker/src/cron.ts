import type { Bindings } from "./types";

export async function handleScheduled(
  controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  // Push the initial collect message to the queue to kick off the pipeline
  await env.QUEUE.send({
    type: "candidate_collection",
  });
  console.log("Cron triggered: Pushed candidate_collection message to Queue.");
}
