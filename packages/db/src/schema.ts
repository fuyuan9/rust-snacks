export interface Repository {
  id: number;
  github_id: number;
  owner: string;
  name: string;
  stars: number;
  forks: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  last_scraped_at: string | null;
  status: "discovered" | "selected" | "analyzed" | "failed";
}

export interface RepositorySnapshot {
  id: number;
  repository_id: number;
  commit_sha: string;
  file_tree_json: string | null; // stringified JSON
  readme: string | null;
  cargo_toml: string | null;
  main_rs: string | null;
  lib_rs: string | null;
  created_at: string;
}

export interface Article {
  id: number;
  repository_id: number;
  series_id: string | null;
  series_index: number;
  series_total: number;
  is_series: number; // 0 or 1
  status: "draft" | "published" | "unpublished" | "needs_review";
  slug: string;
  title: string;
  body_markdown: string;
  body_html: string;
  tags_json: string | null; // stringified JSON array
  seo_json: string | null; // stringified JSON object
  published_at: string | null;
  unpublished_at: string | null;
  analyzed_at: string;
  target_commit_sha: string;
}

export interface Job {
  id: number;
  job_type:
    | "candidate_collection"
    | "repository_selection"
    | "snapshot"
    | "article_generation"
    | "publish";
  repository_id: number | null;
  status: "pending" | "running" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
