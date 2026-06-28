import type { DbClient, Job } from "@rust-snacks/db";

export async function runJobWithTracking<T>(
  dbClient: DbClient,
  jobType: Job["job_type"],
  repositoryId: number | null,
  fn: () => Promise<T>,
): Promise<T> {
  const job = await dbClient.createJob({
    job_type: jobType,
    repository_id: repositoryId,
  });

  try {
    // Update status to running
    await dbClient.updateJobStatus(job.id, "running");

    // Execute job
    const result = await fn();

    // Mark completed
    await dbClient.updateJobStatus(job.id, "completed");
    return result;
  } catch (error: any) {
    // Mark failed
    await dbClient.updateJobStatus(
      job.id,
      "failed",
      error.message || String(error),
    );
    throw error;
  }
}
