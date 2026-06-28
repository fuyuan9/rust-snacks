import { Marked, Renderer } from "marked";

// Custom renderer to support Mermaid code blocks
const renderer = new Renderer();
const originalCode = renderer.code.bind(renderer);

renderer.code = (
  code: string,
  infostring: string | undefined,
  escaped: boolean,
): string => {
  if (infostring === "mermaid") {
    const cleanedCode = code
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    return `<div class="mermaid">${cleanedCode}</div>`;
  }
  return originalCode(code, infostring, escaped);
};

const marked = new Marked({ renderer });

export function parseMarkdown(md: string): string {
  // Pre-process to convert markdown bold **text** to HTML strong tags
  // This solves Marked's issue with Japanese word boundaries (e.g. **「text」**)
  let processed = md.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");

  // Pre-process markdown to convert GitHub callouts
  const alertTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];
  for (const type of alertTypes) {
    const regex = new RegExp(`> \\[!${type}\\]`, "g");
    processed = processed.replace(
      regex,
      `> <span class="alert-badge alert-${type.toLowerCase()}"><strong>${type}</strong></span>`,
    );
  }

  // Parse using marked
  const parsed = marked.parse(processed) as string;

  // Custom class injection for blockquotes based on alert type
  let finalHtml = parsed;
  for (const type of alertTypes) {
    const badgeHtml = `<span class="alert-badge alert-${type.toLowerCase()}"><strong>${type}</strong></span>`;
    // We want to add the class alert-type to the surrounding <blockquote>
    // To do this simply, we can replace blockquotes that contain the alert badge
    finalHtml = finalHtml.replace(
      new RegExp(
        `<blockquote>([\\s\\S]*?)${type.toLowerCase()}([\\s\\S]*?)</blockquote>`,
        "g",
      ),
      `<blockquote class="alert-${type.toLowerCase()}">$1$2</blockquote>`,
    );
  }

  return sanitizeHtml(finalHtml);
}

export function sanitizeHtml(html: string): string {
  // Remove script tags and contents
  let clean = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  // Remove on* event handlers (e.g. onload, onerror, onclick)
  clean = clean.replace(/on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, "");
  // Remove javascript: protocols in href
  clean = clean.replace(
    /href\s*=\s*['"]\s*javascript:[^'"]*['"]/gi,
    'href="#"',
  );
  // Remove iframe/object/embed/form elements for defense-in-depth
  clean = clean.replace(
    /<(iframe|object|embed|form)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    "",
  );
  return clean;
}
