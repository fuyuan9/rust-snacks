export interface GithubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
  };
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  forks_count: number;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license: {
    key: string;
    name: string;
    spdx_id: string;
    url: string;
    node_id: string;
  } | null;
  allow_forking: boolean;
  is_template: boolean;
  web_commit_signoff_required: boolean;
  topics: string[];
  visibility: string;
  forks: number;
  open_issues: number;
  watchers: number;
  default_branch: string;
}

export class GithubClient {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = path.startsWith("http")
      ? path
      : `https://api.github.com${path}`;
    const headers = new Headers(options.headers);
    headers.set("User-Agent", "rust-snacks-bot");
    headers.set("Accept", "application/vnd.github.v3+json");
    if (this.token) {
      headers.set("Authorization", `token ${this.token}`);
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(
        `GitHub API Error: ${response.status} ${response.statusText} for ${url}`,
      );
    }
    return response.json() as Promise<T>;
  }

  async searchRustRepos(
    minStars = 100,
    page = 1,
    perPage = 30,
  ): Promise<GithubRepo[]> {
    // Rust language, not archived, not a fork
    const q = `language:rust archived:false fork:false stars:>=${minStars}`;
    const path = `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&page=${page}&per_page=${perPage}`;
    const data = await this.request<{ items: GithubRepo[] }>(path);
    return data.items || [];
  }

  async getRepoContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<{ content: string; sha: string } | null> {
    try {
      const urlPath = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`;
      const data = await this.request<{
        content?: string;
        encoding?: string;
        sha: string;
      }>(urlPath);
      if (data.content && data.encoding === "base64") {
        // Base64 decode (using atob or Buffer, in Cloudflare Workers atob is globally available)
        const base64Clean = data.content.replace(/\s/g, "");
        const decoded = atob(base64Clean);
        // correctly handle utf-8 decodes
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i);
        }
        const utf8Decoded = new TextDecoder("utf-8").decode(bytes);
        return { content: utf8Decoded, sha: data.sha };
      }
      return null;
    } catch (e) {
      return null; // Return null if file not found or other error
    }
  }

  async getFileTree(
    owner: string,
    repo: string,
    branch = "main",
  ): Promise<{ path: string; type: string; sha: string; size?: number }[]> {
    try {
      // First get the latest commit sha of the branch
      const refPath = `/repos/${owner}/${repo}/git/ref/heads/${branch}`;
      const refData = await this.request<{ object: { sha: string } }>(refPath);
      const commitSha = refData.object.sha;

      // Get the tree recursively
      const treePath = `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`;
      const treeData = await this.request<{
        tree: { path: string; type: string; sha: string; size?: number }[];
      }>(treePath);
      return treeData.tree || [];
    } catch (e) {
      // Fallback if branch is master instead of main
      if (branch === "main") {
        return this.getFileTree(owner, repo, "master");
      }
      return [];
    }
  }

  async getLatestCommitSha(
    owner: string,
    repo: string,
    branch = "main",
  ): Promise<string> {
    try {
      const refPath = `/repos/${owner}/${repo}/git/ref/heads/${branch}`;
      const refData = await this.request<{ object: { sha: string } }>(refPath);
      return refData.object.sha;
    } catch (e) {
      if (branch === "main") {
        return this.getLatestCommitSha(owner, repo, "master");
      }
      throw e;
    }
  }
}
