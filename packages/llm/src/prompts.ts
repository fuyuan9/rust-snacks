export const UNDERSTANDING_PROMPT = `
You are analyzing a Rust repository to understand its core purpose, features, and key modules.
Given the file tree, README, and Cargo.toml:
- Explain what this project does.
- Outline the main components and how they interact.
- Identify the core source files to look into for deep design patterns.

Input:
File Tree:
{{fileTree}}

README:
{{readme}}

Cargo.toml:
{{cargoToml}}

Output format: JSON object
{
  "purpose": "brief summary",
  "components": ["component A", "component B"],
  "targetFiles": ["src/lib.rs", "src/main.rs"],
  "estimatedComplexity": "low|medium|high"
}
`;

export const DESIGN_ANALYSIS_PROMPT = `
You are a senior Rust systems architect. Analyze the design patterns, trait usage, generics, ownership, async, unsafe, performance, and API design from the source files.
Provide a structural analysis.

Input Files:
README:
{{readme}}

Cargo.toml:
{{cargoToml}}

Main file content:
{{mainRs}}

Library file content:
{{libRs}}

Output format: JSON object
{
  "architectureDescription": "Description of layers/modules",
  "designPatterns": ["Pattern A: trait based strategy", "Pattern B: zero-copy parsing"],
  "rustSpecificTips": [
    {
      "concept": "Trait/Generic/Macro/unsafe/async/ownership",
      "explanation": "Detailed explanation of why it was written this way",
      "codeSnippet": "Snippet showing the pattern"
    }
  ],
  "tradeoffs": "Tradeoffs chosen in the implementation"
}
`;

export const ARTICLE_WRITER_PROMPT = `
You are a technical writer specialized in Rust systems programming. Write a learning-focused article based on the analysis.
The goal is to teach software engineers and Rust learners practical patterns they can use in their own projects.

CRITICAL REQUIREMENTS:
- 1 Article MUST focus on exactly ONE theme.
- Length: Short and readable. Under 3000 Japanese characters.
- Number of tips: Max 5 tips.
- Diagrams: Max 3 Mermaid.js diagrams.
- Include target commit SHA and analysis date in the header/meta.
- Format: Markdown (no code blocks with extremely long raw code, focus on snippets).
- Separate fact (what is in the code) from speculation (assumed intent/performance benefits).

Determine if this project warrants a Series (is_series: true) due to complexity or multiple domains.
If yes, determine the series_total and generate Part {{seriesIndex}} focusing on a specific theme (e.g. "{OSS名}に学ぶ{テーマ} Part 1").

Input Analysis:
{{analysis}}

Output format: JSON object
{
  "title": "Article Title",
  "slug": "article-slug-url-friendly",
  "is_series": true|false,
  "series_index": 1,
  "series_total": 3,
  "series_id": "unique-series-string-or-null",
  "theme": "The specific theme of this part",
  "body_markdown": "Markdown body containing: ## 1. 概要\\n## 2. アーキテクチャ (with Mermaid if any)\\n## 3. この記事で学べること (Max 5 items)\\n## 4. 実践的な実装・コード解説\\n## 5. 実務に持ち帰れるTips (Max 5 tips)\\n## 6. トレードオフと注意点\\n## 7. まとめ\\n",
  "tags": ["Rust", "Trait", "Async"],
  "seo": {
    "title": "SEO Title",
    "description": "SEO Description (Max 120 chars)",
    "keywords": "rust, learning, pattern"
  }
}
`;

export const QUALITY_GATE_PROMPT = `
Verify if the generated article meets the following quality standards:
1. Length: body_markdown is under 3000 Japanese characters.
2. Structure: contains Overview, What to learn (<=5 items), Implementation detail, Tips (<= 5 items), Trade-offs, Summary.
3. No extremely long raw code dumps.
4. Mermaid diagrams <= 3.
5. Title contains Part X if it is a series.
6. Clearly references the analyzed commit and analysis date.

Input Article:
{{article}}

Output format: JSON object
{
  "passed": true|false,
  "reasons": ["Error reason 1", "Error reason 2"]
}
`;
