-- 1. repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_scraped_at TEXT,
  status TEXT NOT NULL DEFAULT 'discovered' -- 'discovered', 'selected', 'analyzed', 'failed'
);

-- 2. repository_snapshots table
CREATE TABLE IF NOT EXISTS repository_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  file_tree_json TEXT, -- JSON representation of important files
  readme TEXT,
  cargo_toml TEXT,
  main_rs TEXT,
  lib_rs TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- 3. articles table
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id INTEGER NOT NULL,
  series_id TEXT, -- UUID or unique string to group series
  series_index INTEGER DEFAULT 0,
  series_total INTEGER DEFAULT 0,
  is_series INTEGER DEFAULT 0, -- 0 = false, 1 = true
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'unpublished', 'needs_review'
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_html TEXT NOT NULL,
  tags_json TEXT, -- JSON array of tags
  seo_json TEXT, -- JSON object { title, description, keywords }
  published_at TEXT,
  unpublished_at TEXT,
  analyzed_at TEXT NOT NULL,
  target_commit_sha TEXT NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- 4. jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL, -- 'candidate_collection', 'repository_selection', 'snapshot', 'article_generation', 'publish'
  repository_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE SET NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_repositories_status ON repositories(status);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
