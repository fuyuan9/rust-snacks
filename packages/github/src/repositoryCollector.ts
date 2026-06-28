import type { DbClient } from "@rust-snacks/db";
import { GithubClient } from "./github";

export class RepositoryCollector {
  private githubClient: GithubClient;

  constructor(token?: string) {
    this.githubClient = new GithubClient(token);
  }

  async collectCandidateRepositories(
    dbClient: DbClient,
    minStars = 100,
  ): Promise<number> {
    const repos = await this.githubClient.searchRustRepos(minStars, 1, 30);
    let count = 0;

    for (const repo of repos) {
      // Exclude core rust repository
      if (
        repo.owner.login.toLowerCase() === "rust-lang" &&
        repo.name.toLowerCase() === "rust"
      ) {
        console.log("Skipping core rust repository: rust-lang/rust");
        continue;
      }

      // Exclude excessively large repositories (> 100MB = 100,000 KB)
      if (repo.size > 100000) {
        console.log(
          `Skipping excessively large repository: ${repo.owner.login}/${repo.name} (Size: ${repo.size} KB)`,
        );
        continue;
      }

      // Check if already in db
      const existing = await dbClient.getRepositoryByGithubId(repo.id);

      // Basic check: we will save it as discovered
      await dbClient.upsertRepository({
        github_id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        stars: repo.stargazers_count,
        forks: repo.forks,
        description: repo.description,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
      });

      if (!existing) {
        count++;
      }
    }

    return count;
  }
}
