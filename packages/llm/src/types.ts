export interface LlmConfig {
  apiKey?: string;
  provider?: string; // 'gemini' | 'cloudflare' etc.
  model?: string;
}

export interface UnderstandingResult {
  purpose: string;
  components: string[];
  targetFiles: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

export interface DesignAnalysisResult {
  architectureDescription: string;
  designPatterns: string[];
  rustSpecificTips: {
    concept: string;
    explanation: string;
    codeSnippet: string;
  }[];
  tradeoffs: string;
}

export interface ArticleResult {
  title: string;
  slug: string;
  is_series: boolean;
  series_index: number;
  series_total: number;
  series_id: string | null;
  theme: string;
  body_markdown: string;
  tags: string[];
  seo: {
    title: string;
    description: string;
    keywords: string;
  };
}

export interface QualityGateResult {
  passed: boolean;
  reasons: string[];
}
