import type { R2Bucket } from "@cloudflare/workers-types";
import type { Article, DbClient, Repository } from "@rust-snacks/db";
import {
  ARTICLE_WRITER_PROMPT,
  DESIGN_ANALYSIS_PROMPT,
  LlmClient,
  QUALITY_GATE_PROMPT,
  UNDERSTANDING_PROMPT,
} from "@rust-snacks/llm";
import type {
  ArticleResult,
  DesignAnalysisResult,
  QualityGateResult,
  UnderstandingResult,
} from "@rust-snacks/llm";
import { parseMarkdown, renderLayout } from "@rust-snacks/renderer";
import { saveArticleAssets } from "./assets";
import { verifyArticleQuality } from "./qualityGate";

export class ArticleGenerator {
  private llmClient: LlmClient;

  constructor(apiKey: string, provider = "gemini", model?: string) {
    this.llmClient = new LlmClient({ apiKey, provider, model });
  }

  async generateArticle(
    dbClient: DbClient,
    r2Bucket: R2Bucket,
    repo: Repository,
    commitSha: string,
    snapshotData: {
      readme: string | null;
      cargo_toml: string | null;
      main_rs: string | null;
      lib_rs: string | null;
      file_tree_json: string | null;
    },
  ): Promise<number> {
    const analyzedAt = new Date().toISOString();

    // Step 1: Understand
    const understandPrompt = UNDERSTANDING_PROMPT.replace(
      "{{fileTree}}",
      snapshotData.file_tree_json || "",
    )
      .replace("{{readme}}", snapshotData.readme || "")
      .replace("{{cargoToml}}", snapshotData.cargo_toml || "");

    const understanding =
      await this.llmClient.generateJson<UnderstandingResult>(understandPrompt);

    // Step 2: Analyze
    const analyzePrompt = DESIGN_ANALYSIS_PROMPT.replace(
      "{{readme}}",
      snapshotData.readme || "",
    )
      .replace("{{cargoToml}}", snapshotData.cargo_toml || "")
      .replace("{{mainRs}}", snapshotData.main_rs || "")
      .replace("{{libRs}}", snapshotData.lib_rs || "");

    const analysis =
      await this.llmClient.generateJson<DesignAnalysisResult>(analyzePrompt);

    // Step 3: Write Article
    // Check if there is an in-progress series for this repository to continue
    const activeSeries = await dbClient.getLatestActiveSeries();
    let seriesIndex = 1;
    let seriesId: string | null = null;
    let previousContext = "";

    if (activeSeries && activeSeries.repository_id === repo.id) {
      seriesIndex = activeSeries.series_index + 1;
      seriesId = activeSeries.series_id;
      previousContext = `This article is Part ${seriesIndex} of an ongoing series.
Previous Part Title: "${activeSeries.title}"
Previous Part Slug: "${activeSeries.slug}"
Previous Part Markdown summary (first 500 chars):
${activeSeries.body_markdown.substring(0, 500)}
Please ensure you continue the explanation, focusing on a DIFFERENT theme and referring to the previous part where relevant.`;
    }

    const writePrompt = ARTICLE_WRITER_PROMPT.replace(
      "{{seriesIndex}}",
      seriesIndex.toString(),
    ).replace(
      "{{analysis}}",
      JSON.stringify({
        repo,
        understanding,
        analysis,
        commitSha,
        analyzedAt,
        previousContext,
      }),
    );

    const generatedArticle =
      await this.llmClient.generateJson<ArticleResult>(writePrompt);

    // Parse Markdown to HTML
    const bodyHtml = parseMarkdown(generatedArticle.body_markdown);

    const articleInput = {
      title: generatedArticle.title,
      slug: generatedArticle.slug,
      body_markdown: generatedArticle.body_markdown,
      tags: generatedArticle.tags,
      seo: generatedArticle.seo,
      target_commit_sha: commitSha,
      analyzed_at: analyzedAt,
    };

    // Step 4: Quality Gate
    const gateResult = verifyArticleQuality(articleInput);
    const status = gateResult.passed ? "published" : "needs_review";

    // Form complete HTML with layout
    const completeHtml = renderLayout({
      title: generatedArticle.seo.title,
      description: generatedArticle.seo.description,
      keywords: generatedArticle.seo.keywords,
      bodyHtml: `
        <article class="content-body">
          <div class="article-header">
            <h1 class="article-title">${generatedArticle.title}</h1>
            <div class="meta-info">
              <div class="meta-item">解析日: ${new Date(analyzedAt).toLocaleDateString("ja-JP")}</div>
              <div class="meta-item">対象コミット: <a href="https://github.com/${repo.owner}/${repo.name}/commit/${commitSha}" target="_blank">${commitSha.substring(0, 7)}</a></div>
              <div class="meta-item">リポジトリ: <a href="https://github.com/${repo.owner}/${repo.name}" target="_blank">${repo.owner}/${repo.name}</a></div>
            </div>
            <div class="tags">
              ${generatedArticle.tags.map((t) => `<span class="tag">${t}</span>`).join("")}
            </div>
          </div>
          ${bodyHtml}
        </article>
      `,
    });

    const finalSeriesId =
      generatedArticle.series_id || seriesId || crypto.randomUUID();
    const finalSeriesIndex = generatedArticle.is_series
      ? generatedArticle.series_index || seriesIndex
      : 1;
    const finalSeriesTotal = generatedArticle.is_series
      ? generatedArticle.series_total || 1
      : 1;

    const newArticleId = await dbClient.insertArticle({
      repository_id: repo.id,
      series_id: finalSeriesId,
      series_index: finalSeriesIndex,
      series_total: finalSeriesTotal,
      is_series: generatedArticle.is_series ? 1 : 0,
      status,
      slug: generatedArticle.slug,
      title: generatedArticle.title,
      body_markdown: generatedArticle.body_markdown,
      body_html: completeHtml,
      tags_json: JSON.stringify(generatedArticle.tags),
      seo_json: JSON.stringify(generatedArticle.seo),
      published_at: status === "published" ? new Date().toISOString() : null,
      unpublished_at: null,
      analyzed_at: analyzedAt,
      target_commit_sha: commitSha,
    });

    // Step 5: Save assets to R2 if published
    if (status === "published") {
      await saveArticleAssets(
        generatedArticle.slug,
        completeHtml,
        dbClient,
        r2Bucket,
      );
    }

    // Update repository status to analyzed
    await dbClient.updateRepositoryStatus(repo.id, "analyzed");

    return newArticleId;
  }
}
