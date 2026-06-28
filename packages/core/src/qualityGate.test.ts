import { describe, expect, it } from "vitest";
import { verifyArticleQuality } from "./qualityGate";
import type { ArticleInput } from "./qualityGate";

describe("verifyArticleQuality", () => {
  const validArticle: ArticleInput = {
    title: "Tokioに学ぶTask管理",
    slug: "tokio-task-management",
    body_markdown: `
## 1. 概要
TokioのTask管理手法について解説します。

## 2. アーキテクチャ
\`\`\`mermaid
graph TD
A[Scheduler] --> B[Worker]
\`\`\`

## 3. この記事で学べること
- Task管理
- スケジューラ

## 4. 実践的な実装・コード解説
コードの解説です。

## 5. 実務に持ち帰れるTips
- Tip 1
- Tip 2
- Tip 3

## 6. トレードオフと注意点
パフォーマンスと複雑性のトレードオフがあります。

## 7. まとめ
まとめです。
`,
    tags: ["Rust", "Async"],
    seo: {
      title: "Tokio Task Management SEO",
      description: "Tokio task management detailed explanation.",
      keywords: "tokio, rust, async",
    },
    target_commit_sha: "a1b2c3d4e5f6",
    analyzed_at: new Date().toISOString(),
  };

  it("should pass a valid article", () => {
    const result = verifyArticleQuality(validArticle);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("should fail if title, slug or body is empty", () => {
    const invalid = { ...validArticle, title: "" };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Title, slug, or body is empty.");
  });

  it("should fail if body length exceeds 3000 characters", () => {
    const longBody = "A".repeat(3001);
    const invalid = { ...validArticle, body_markdown: longBody };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("must be <= 3000");
  });

  it("should fail if it contains more than 5 tips", () => {
    const invalid = {
      ...validArticle,
      body_markdown: validArticle.body_markdown.replace(
        "## 5. 実務に持ち帰れるTips\n- Tip 1\n- Tip 2\n- Tip 3",
        "## 5. 実務に持ち帰れるTips\n- Tip 1\n- Tip 2\n- Tip 3\n- Tip 4\n- Tip 5\n- Tip 6\n- Tip 7",
      ),
    };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("Contains 7 tips (must be <= 5)");
  });

  it("should fail if it contains more than 3 Mermaid diagrams", () => {
    const invalid = {
      ...validArticle,
      body_markdown: `${validArticle.body_markdown}\n\`\`\`mermaid\n\`\`\`\n\`\`\`mermaid\n\`\`\`\n\`\`\`mermaid\n\`\`\``,
    };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("Mermaid diagrams (must be <= 3)");
  });

  it("should fail if target_commit_sha or analyzed_at is missing", () => {
    const invalid = { ...validArticle, target_commit_sha: "" };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Target commit SHA is missing.");
  });

  it("should fail if Trade-offs section is missing", () => {
    const invalid = {
      ...validArticle,
      body_markdown: validArticle.body_markdown.replace(
        "## 6. トレードオフと注意点",
        "## 6. その他",
      ),
    };
    const result = verifyArticleQuality(invalid);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain(
      "Missing section about trade-offs and cautions.",
    );
  });
});
