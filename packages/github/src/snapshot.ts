import type { R2Bucket } from "@cloudflare/workers-types";
import type { DbClient } from "@rust-snacks/db";
import { GithubClient } from "./github";

export class SnapshotTaker {
  private githubClient: GithubClient;

  constructor(token?: string) {
    this.githubClient = new GithubClient(token);
  }

  async takeSnapshot(
    dbClient: DbClient,
    r2Bucket: R2Bucket,
    repoId: number,
    owner: string,
    repo: string,
  ): Promise<string> {
    // 1. Get latest commit sha
    const commitSha = await this.githubClient.getLatestCommitSha(owner, repo);

    // 2. Get file tree
    const tree = await this.githubClient.getFileTree(owner, repo);
    const fileTreeJson = JSON.stringify(tree);

    // 3. Fetch key files (limit sizes)
    const readmeData = await this.githubClient.getRepoContent(
      owner,
      repo,
      "README.md",
      commitSha,
    );
    const cargoTomlData = await this.githubClient.getRepoContent(
      owner,
      repo,
      "Cargo.toml",
      commitSha,
    );

    // Find lib.rs or main.rs
    const libRsPath =
      tree.find((f) => f.path.endsWith("lib.rs"))?.path || "src/lib.rs";
    const mainRsPath =
      tree.find((f) => f.path.endsWith("main.rs"))?.path || "src/main.rs";

    const libRsData = await this.githubClient.getRepoContent(
      owner,
      repo,
      libRsPath,
      commitSha,
    );
    const mainRsData = await this.githubClient.getRepoContent(
      owner,
      repo,
      mainRsPath,
      commitSha,
    );

    const readme = readmeData?.content
      ? this.truncate(readmeData.content, 20000)
      : null;
    const cargo_toml = cargoTomlData?.content
      ? this.truncate(cargoTomlData.content, 10000)
      : null;
    const lib_rs = libRsData?.content
      ? this.truncate(libRsData.content, 30000)
      : null;
    const main_rs = mainRsData?.content
      ? this.truncate(mainRsData.content, 30000)
      : null;

    // Save tree and metadata to R2
    const r2KeyPrefix = `snapshots/${repoId}/${commitSha}`;
    await r2Bucket.put(`${r2KeyPrefix}/file_tree.json`, fileTreeJson);
    if (readme) await r2Bucket.put(`${r2KeyPrefix}/README.md`, readme);
    if (cargo_toml) await r2Bucket.put(`${r2KeyPrefix}/Cargo.toml`, cargo_toml);
    if (lib_rs) await r2Bucket.put(`${r2KeyPrefix}/lib.rs`, lib_rs);
    if (main_rs) await r2Bucket.put(`${r2KeyPrefix}/main.rs`, main_rs);

    // 4. Save to D1
    await dbClient.insertSnapshot({
      repository_id: repoId,
      commit_sha: commitSha,
      file_tree_json: fileTreeJson,
      readme,
      cargo_toml,
      main_rs,
      lib_rs,
      created_at: new Date().toISOString(),
    });

    // Update repository status to analyzed (or selected)
    await dbClient.updateRepositoryStatus(repoId, "selected");

    return commitSha;
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return `${str.substring(0, maxLength)}\n... [TRUNCATED]`;
  }
}
