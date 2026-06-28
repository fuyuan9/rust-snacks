import { styles } from "./styles";

export interface LayoutOptions {
  title: string;
  description: string;
  keywords: string;
  bodyHtml: string;
  metaHtml?: string;
  headerTitle?: string;
}

export function renderLayout(options: LayoutOptions): string {
  const headerTitle = options.headerTitle || "Rust Snacks 🦀";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  <meta name="description" content="${options.description}">
  <meta name="keywords" content="${options.keywords}">
  <!-- OGP Tags -->
  <meta property="og:title" content="${options.title}">
  <meta property="og:description" content="${options.description}">
  <meta property="og:type" content="article">
  <style>
    ${styles}
  </style>
  <!-- Prism.js Syntax Highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js" defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js" defer></script>
  <!-- Mermaid Support -->
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'strict'
    });
  </script>
</head>
<body>
  <header>
    <div class="header-container">
      <a href="/" class="logo">${headerTitle}</a>
      <span class="logo-sub">Rustの設計と実装Tipsを学ぶ</span>
    </div>
  </header>
  
  <main>
    ${options.bodyHtml}
  </main>

  <footer>
    <p>&copy; ${new Date().getFullYear()} Rust Snacks. All rights reserved.</p>
    <p>毎日更新・自動選定・解説メディア</p>
  </footer>
</body>
</html>
`;
}

export interface ArticleListItem {
  title: string;
  slug: string;
  description: string;
  published_at: string;
  is_series: boolean;
  series_index?: number;
  series_total?: number;
}

export function renderArticleList(articles: ArticleListItem[]): string {
  const listHtml = articles
    .map((article) => {
      const seriesLabel = article.is_series
        ? `<span class="tag">連載 Part ${article.series_index}/${article.series_total}</span>`
        : "";
      const dateStr = new Date(article.published_at).toLocaleDateString(
        "ja-JP",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      );

      return `
      <a href="/articles/${article.slug}" class="article-card">
        <h2 class="article-card-title">${article.title}</h2>
        <p class="article-card-desc">${article.description}</p>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span style="font-size: 0.8rem; color: #9ca3af;">${dateStr}</span>
          ${seriesLabel}
        </div>
      </a>
    `;
    })
    .join("");

  const bodyHtml = `
    <div class="article-header">
      <h1 class="article-title">記事一覧</h1>
      <p style="color: #9ca3af;">RustのOSSコードから、設計思想・アーキテクチャ・Tipsを1話3分で学ぶ。</p>
    </div>
    <div class="articles-list">
      ${listHtml || '<p style="color: #9ca3af;">現在、公開されている記事はありません。</p>'}
    </div>
  `;

  return renderLayout({
    title: "Rust Snacks - Rustの設計と実装Tipsを学ぶ",
    description:
      "Rustの実用的なOSSコードから、設計思想・アーキテクチャ・実装Tipsを学ぶ解説メディア。毎日自動更新。",
    keywords: "Rust, 設計, アーキテクチャ, 毎日更新, OSS, Tips",
    bodyHtml,
  });
}
