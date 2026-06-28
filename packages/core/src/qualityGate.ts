export interface ArticleInput {
  title: string;
  slug: string;
  body_markdown: string;
  tags: string[];
  seo: {
    title: string;
    description: string;
    keywords: string;
  };
  target_commit_sha: string;
  analyzed_at: string;
}

export interface QualityCheckResult {
  passed: boolean;
  reasons: string[];
}

export function verifyArticleQuality(
  article: ArticleInput,
): QualityCheckResult {
  const reasons: string[] = [];

  // 1. Not empty
  if (!article.title || !article.slug || !article.body_markdown) {
    reasons.push("Title, slug, or body is empty.");
  }

  // 2. Body length <= 15000 Japanese characters
  if (article.body_markdown.length > 15000) {
    reasons.push(
      `Body length is ${article.body_markdown.length} characters (must be <= 15000).`,
    );
  }

  // 3. Tips <= 5 (Checking for occurrences of "Tips" or list items in the tips section)
  // We can count list items under a "実務に持ち帰れるTips" header.
  const tipsSection = article.body_markdown.match(/## .*Tips[\s\S]*?(?=##|$)/i);
  if (tipsSection) {
    const listItems = tipsSection[0].match(/^\s*-\s+/gm);
    if (listItems && listItems.length > 5) {
      reasons.push(`Contains ${listItems.length} tips (must be <= 5).`);
    }
  }

  // 4. Diagrams <= 3 (Mermaid code blocks)
  const mermaidBlocks = article.body_markdown.match(/```mermaid/g);
  if (mermaidBlocks && mermaidBlocks.length > 3) {
    reasons.push(
      `Contains ${mermaidBlocks.length} Mermaid diagrams (must be <= 3).`,
    );
  }

  // 5. Must have analyzed_at and commit sha referenced
  if (!article.target_commit_sha) {
    reasons.push("Target commit SHA is missing.");
  }
  if (!article.analyzed_at) {
    reasons.push("Analyzed date is missing.");
  }

  // 6. Must have Trade-offs and Attention header
  const hasTradeoffs = /## .*トレードオフ|## .*注意点/i.test(
    article.body_markdown,
  );
  if (!hasTradeoffs) {
    reasons.push("Missing section about trade-offs and cautions.");
  }

  // 7. Check for extremely long code blocks (more than 50 lines in a single block)
  const codeBlocks = article.body_markdown.match(/```rust[\s\S]*?```/g);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      const lineCount = block.split("\n").length;
      if (lineCount > 50) {
        reasons.push(
          `Contains an excessively long code block (${lineCount} lines). Code snippets should be concise.`,
        );
        break;
      }
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
