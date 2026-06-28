import type { DbClient, Repository } from "@rust-snacks/db";

export function calculateScore(repo: Repository): number {
  let score = 0;

  // Stars score: log-scale like or linear.
  score += Math.min(repo.stars * 0.1, 1000); // Max 1000 points from stars

  // Forks score:
  score += Math.min(repo.forks * 0.5, 500); // Max 500 points from forks

  // Activity score: updated recently
  const lastUpdated = new Date(repo.updated_at).getTime();
  const now = new Date().getTime();
  const diffDays = (now - lastUpdated) / (1000 * 60 * 60 * 24);

  if (diffDays < 7) {
    score += 300;
  } else if (diffDays < 30) {
    score += 150;
  } else if (diffDays < 180) {
    score += 50;
  }

  // Descriptions helper
  if (repo.description && repo.description.length > 10) {
    score += 50;
  }

  return score;
}

export async function selectTopRepository(
  dbClient: DbClient,
): Promise<Repository | null> {
  const discovered = await dbClient.getDiscoveredRepositories();
  if (discovered.length === 0) return null;

  let bestRepo: Repository | null = null;
  let highestScore = -1;

  for (const repo of discovered) {
    // Cooldown check: Do not select repositories that have been written about in the last 90 days
    const hasRecent = await dbClient.hasRecentArticle(repo.id, 90);
    if (hasRecent) {
      console.log(
        `Repository ${repo.owner}/${repo.name} (ID: ${repo.id}) is on cooldown (90 days). Skipping.`,
      );
      continue;
    }

    const score = calculateScore(repo);
    if (score > highestScore) {
      highestScore = score;
      bestRepo = repo;
    }
  }

  return bestRepo;
}
