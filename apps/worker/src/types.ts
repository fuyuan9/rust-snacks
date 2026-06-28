import type {
  D1Database,
  KVNamespace,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";

export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  QUEUE: Queue<any>;

  // Secrets and configs
  GITHUB_TOKEN?: string;
  LLM_API_KEY?: string;
  LLM_PROVIDER?: string; // 'gemini' | 'cloudflare' etc.
  LLM_MODEL?: string;
  SITE_DOMAIN?: string;
  ADMIN_API_KEY?: string;
  ENVIRONMENT?: string; // 'production' | 'development'
}
