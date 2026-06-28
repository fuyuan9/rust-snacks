import type { D1Database } from "@cloudflare/workers-types";
import type { Article, Job, Repository, RepositorySnapshot } from "./schema";

export class DbClient {
  constructor(private db: D1Database) {}

  // Repositories
  async getRepository(id: number): Promise<Repository | null> {
    return this.db
      .prepare("SELECT * FROM repositories WHERE id = ?")
      .bind(id)
      .first<Repository>();
  }

  async getRepositoryByGithubId(githubId: number): Promise<Repository | null> {
    return this.db
      .prepare("SELECT * FROM repositories WHERE github_id = ?")
      .bind(githubId)
      .first<Repository>();
  }

  async upsertRepository(
    repo: Omit<Repository, "id" | "last_scraped_at" | "status">,
  ): Promise<Repository> {
    const existing = await this.getRepositoryByGithubId(repo.github_id);
    if (existing) {
      await this.db
        .prepare(
          "UPDATE repositories SET stars = ?, forks = ?, description = ?, updated_at = ? WHERE github_id = ?",
        )
        .bind(
          repo.stars,
          repo.forks,
          repo.description,
          repo.updated_at,
          repo.github_id,
        )
        .run();
      return {
        ...existing,
        stars: repo.stars,
        forks: repo.forks,
        description: repo.description,
        updated_at: repo.updated_at,
      };
    }

    const result = await this.db
      .prepare(
        "INSERT INTO repositories (github_id, owner, name, stars, forks, description, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        repo.github_id,
        repo.owner,
        repo.name,
        repo.stars,
        repo.forks,
        repo.description,
        repo.created_at,
        repo.updated_at,
        "discovered",
      )
      .run();

    const inserted = await this.getRepositoryByGithubId(repo.github_id);
    if (!inserted) throw new Error("Failed to insert repository");
    return inserted;
  }

  async updateRepositoryStatus(
    id: number,
    status: Repository["status"],
  ): Promise<void> {
    await this.db
      .prepare("UPDATE repositories SET status = ? WHERE id = ?")
      .bind(status, id)
      .run();
  }

  async getDiscoveredRepositories(): Promise<Repository[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM repositories WHERE status = 'discovered'")
      .all<Repository>();
    return results || [];
  }

  // Repository Snapshots
  async getLatestSnapshot(
    repositoryId: number,
  ): Promise<RepositorySnapshot | null> {
    return this.db
      .prepare(
        "SELECT * FROM repository_snapshots WHERE repository_id = ? ORDER BY id DESC LIMIT 1",
      )
      .bind(repositoryId)
      .first<RepositorySnapshot>();
  }

  async insertSnapshot(
    snapshot: Omit<RepositorySnapshot, "id">,
  ): Promise<number> {
    const result = await this.db
      .prepare(
        "INSERT INTO repository_snapshots (repository_id, commit_sha, file_tree_json, readme, cargo_toml, main_rs, lib_rs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        snapshot.repository_id,
        snapshot.commit_sha,
        snapshot.file_tree_json,
        snapshot.readme,
        snapshot.cargo_toml,
        snapshot.main_rs,
        snapshot.lib_rs,
        snapshot.created_at,
      )
      .run();
    return result.meta.last_row_id || 0;
  }

  // Articles
  async getArticleBySlug(slug: string): Promise<Article | null> {
    return this.db
      .prepare("SELECT * FROM articles WHERE slug = ?")
      .bind(slug)
      .first<Article>();
  }

  async getPublishedArticles(): Promise<Article[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC",
      )
      .all<Article>();
    return results || [];
  }

  async getLatestActiveSeries(): Promise<Article | null> {
    return this.db
      .prepare(
        "SELECT * FROM articles WHERE is_series = 1 AND series_index < series_total ORDER BY id DESC LIMIT 1",
      )
      .first<Article>();
  }

  async insertArticle(article: Omit<Article, "id">): Promise<number> {
    const result = await this.db
      .prepare(
        "INSERT INTO articles (repository_id, series_id, series_index, series_total, is_series, status, slug, title, body_markdown, body_html, tags_json, seo_json, published_at, unpublished_at, analyzed_at, target_commit_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        article.repository_id,
        article.series_id,
        article.series_index,
        article.series_total,
        article.is_series,
        article.status,
        article.slug,
        article.title,
        article.body_markdown,
        article.body_html,
        article.tags_json,
        article.seo_json,
        article.published_at,
        article.unpublished_at,
        article.analyzed_at,
        article.target_commit_sha,
      )
      .run();
    return result.meta.last_row_id || 0;
  }

  async updateArticleStatus(
    id: number,
    status: Article["status"],
    publishedAt?: string | null,
    unpublishedAt?: string | null,
  ): Promise<void> {
    if (publishedAt !== undefined || unpublishedAt !== undefined) {
      await this.db
        .prepare(
          "UPDATE articles SET status = ?, published_at = COALESCE(?, published_at), unpublished_at = COALESCE(?, unpublished_at) WHERE id = ?",
        )
        .bind(status, publishedAt || null, unpublishedAt || null, id)
        .run();
    } else {
      await this.db
        .prepare("UPDATE articles SET status = ? WHERE id = ?")
        .bind(status, id)
        .run();
    }
  }

  // Jobs
  async createJob(
    job: Omit<
      Job,
      "id" | "status" | "error_message" | "updated_at" | "created_at"
    >,
  ): Promise<Job> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        "INSERT INTO jobs (job_type, repository_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(job.job_type, job.repository_id, "pending", now, now)
      .run();

    const id = result.meta.last_row_id;
    return {
      id: id || 0,
      job_type: job.job_type,
      repository_id: job.repository_id,
      status: "pending",
      error_message: null,
      created_at: now,
      updated_at: now,
    };
  }

  async updateJobStatus(
    id: number,
    status: Job["status"],
    errorMessage?: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        "UPDATE jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
      )
      .bind(status, errorMessage || null, now, id)
      .run();
  }
}
