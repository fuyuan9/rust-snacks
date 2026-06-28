export const styles = `
:root {
  --bg-color: #0b0f19;
  --text-color: #f3f4f6;
  --primary-color: #3b82f6;
  --secondary-color: #60a5fa;
  --card-bg: rgba(255, 255, 255, 0.03);
  --border-color: rgba(255, 255, 255, 0.08);
  --accent-color: #a855f7;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
}

body {
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: var(--font-sans);
  line-height: 1.7;
  margin: 0;
  padding: 0;
  background-image: 
    radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.1) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.1) 0px, transparent 50%);
  background-attachment: fixed;
}

header {
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
  background-color: rgba(11, 15, 25, 0.7);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.5rem;
  font-weight: 800;
  text-decoration: none;
  background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-sub {
  color: var(--text-color);
  font-size: 0.9rem;
  opacity: 0.6;
}

main {
  max-width: 800px;
  margin: 0 auto;
  padding: 3rem 1rem;
}

.article-header {
  margin-bottom: 2.5rem;
}

.article-title {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1.25;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #ffffff, #9ca3af);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.meta-info {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.85rem;
  color: #9ca3af;
  margin-bottom: 1.5rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--card-bg);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
}

.meta-item a {
  color: var(--secondary-color);
  text-decoration: none;
}

.meta-item a:hover {
  text-decoration: underline;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.tag {
  background-color: rgba(59, 130, 246, 0.1);
  color: var(--secondary-color);
  border: 1px solid rgba(59, 130, 246, 0.2);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.content-body h2 {
  font-size: 1.75rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
  margin-top: 2.5rem;
  color: #ffffff;
}

.content-body h3 {
  font-size: 1.35rem;
  color: #ffffff;
  margin-top: 2rem;
}

.content-body p {
  margin-bottom: 1.5rem;
}

pre {
  background: #111827;
  border: 1px solid var(--border-color);
  padding: 1.25rem;
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

code {
  font-family: var(--font-mono);
  background: rgba(255, 255, 255, 0.08);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9em;
}

pre code {
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.95rem;
}

th, td {
  border: 1px solid var(--border-color);
  padding: 0.75rem 1rem;
  text-align: left;
}

th {
  background-color: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}

tr:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.02);
}

/* Callout Styles */
blockquote {
  border-left: 4px solid var(--primary-color);
  background: rgba(59, 130, 246, 0.05);
  margin: 1.5rem 0;
  padding: 1rem 1.25rem;
  border-radius: 0 8px 8px 0;
}

blockquote p {
  margin: 0;
}

/* GitHub Alert types */
.alert-note {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.alert-tip {
  border-left-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.alert-important {
  border-left-color: #a855f7;
  background: rgba(168, 85, 247, 0.05);
}

.alert-warning {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.05);
}

.alert-caution {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.mermaid {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  margin: 2rem 0;
  display: flex;
  justify-content: center;
}

footer {
  border-top: 1px solid var(--border-color);
  margin-top: 5rem;
  padding: 2.5rem 1rem;
  text-align: center;
  font-size: 0.85rem;
  color: #6b7280;
}

/* Index / Card styles */
.article-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.75rem;
  margin-bottom: 1.5rem;
  transition: transform 0.2s ease, border-color 0.2s ease;
  text-decoration: none;
  display: block;
}

.article-card:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.4);
}

.article-card-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 0.5rem 0;
}

.article-card-desc {
  color: #9ca3af;
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
}
`;
