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
    const repairedCode = repairMermaidSyntax(cleanedCode);
    return `<div class="mermaid">${repairedCode}</div>`;
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

export function repairMermaidSyntax(code: string): string {
  const lines = code.split("\n");
  const repairedLines = lines.map((line) => {
    let repaired = line;

    if (repaired.trim().startsWith("%%")) {
      return repaired;
    }

    // 0.5. Repair unquoted subgraph titles containing parentheses or brackets
    const subgraphRegex = /^(\s*subgraph\s+\w+\s*\[)([^\]]+)(\].*)$/i;
    repaired = repaired.replace(subgraphRegex, (match, prefix, title, suffix) => {
      const trimmedTitle = title.trim();
      if (
        trimmedTitle &&
        (trimmedTitle.includes("(") || trimmedTitle.includes(")")) &&
        !trimmedTitle.startsWith('"') &&
        !trimmedTitle.endsWith('"')
      ) {
        return `${prefix}"${trimmedTitle}"${suffix}`;
      }
      return match;
    });

    const subgraphParenRegex = /^(\s*subgraph\s+\w+\s*\()([^)]+)(\).*)$/i;
    repaired = repaired.replace(subgraphParenRegex, (match, prefix, title, suffix) => {
      const trimmedTitle = title.trim();
      if (
        trimmedTitle &&
        (trimmedTitle.includes("[") || trimmedTitle.includes("]")) &&
        !trimmedTitle.startsWith('"') &&
        !trimmedTitle.endsWith('"')
      ) {
        return `${prefix}"${trimmedTitle}"${suffix}`;
      }
      return match;
    });

    const linkTextRegex = /(-+>|=+>|-\.-+>)\s*\|([^|]+)\|/g;
    repaired = repaired.replace(linkTextRegex, (match, arrow, text) => {
      const trimmedText = text.trim();
      if (trimmedText && (trimmedText.includes("(") || trimmedText.includes(")"))) {
        const cleanedText = trimmedText
          .replace(/\s*\(([^)]+)\)/g, " - $1")
          .replace(/[()]/g, "");
        return `${arrow}|${cleanedText}|`;
      }
      return match;
    });

    // 1. Repair invalid arrows "->" to "-->" (only outside quotes)
    const parts = repaired.split('"');
    for (let j = 0; j < parts.length; j += 2) {
      parts[j] = parts[j]
        .replace(/\b->\b/g, "-->")
        .replace(/\s+->\s+/g, " --> ");
    }
    repaired = parts.join('"');

    // 2. Repair unquoted node labels with parentheses or brackets
    const delimiterPairs = [
      { open: "([", close: "])" },
      { open: "[[", close: "]]" },
      { open: "[(", close: ")]" },
      { open: "((", close: "))" },
      { open: "[/", close: "/]" },
      { open: "[\\", close: "\\]" },
      { open: "{{", close: "}}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: ">", close: "]" },
    ];

    for (const { open, close } of delimiterPairs) {
      repaired = repairLineDelimiters(repaired, open, close);
    }

    return repaired;
  });
  return repairedLines.join("\n");
}

function parseNodeShape(
  line: string,
  open: string,
  close: string,
): { id: string; label: string; start: number; end: number } | null {
  const openIdx = line.indexOf(open);
  if (openIdx === -1) return null;

  // Prevent single-character open delimiters from matching when they are part of multi-character delimiters
  if (open === "(") {
    if (line.substring(openIdx, openIdx + 2) === "([") return null;
    if (openIdx > 0 && line[openIdx - 1] === "[") return null;
  }
  if (open === "[") {
    const nextTwo = line.substring(openIdx, openIdx + 2);
    if (
      nextTwo === "[[" ||
      nextTwo === "[(" ||
      nextTwo === "[/" ||
      nextTwo === "[\\"
    )
      return null;
    if (openIdx > 0 && line[openIdx - 1] === "(") return null;
  }

  const beforeOpen = line.substring(0, openIdx);
  const wordMatch = beforeOpen.match(/(\b\w+)$/);
  if (!wordMatch) return null;

  const id = wordMatch[1];
  const wordStartIdx = openIdx - id.length;

  let balance = 1;
  let closeIdx = -1;
  const searchStart = openIdx + open.length;
  let idx = searchStart;

  while (idx < line.length) {
    if (line.substring(idx, idx + close.length) === close) {
      balance--;
      if (balance === 0) {
        closeIdx = idx;
        break;
      }
      idx += close.length;
    } else if (line.substring(idx, idx + open.length) === open) {
      balance++;
      idx += open.length;
    } else {
      idx++;
    }
  }

  if (closeIdx === -1) return null;

  const label = line.substring(searchStart, closeIdx);
  return {
    id,
    label,
    start: wordStartIdx,
    end: closeIdx + close.length,
  };
}

function repairLineDelimiters(
  line: string,
  open: string,
  close: string,
): string {
  let currentLine = line;
  let searchStart = 0;

  while (searchStart < currentLine.length) {
    const openIdx = currentLine.substring(searchStart).indexOf(open);
    if (openIdx === -1) break;

    const absOpenIdx = searchStart + openIdx;
    const match = parseNodeShape(
      currentLine.substring(searchStart),
      open,
      close,
    );
    if (!match) {
      searchStart = absOpenIdx + open.length;
      continue;
    }

    const absStart = searchStart + match.start;
    const absEnd = searchStart + match.end;
    const trimmedLabel = match.label.trim();

    if (!trimmedLabel.startsWith('"') || !trimmedLabel.endsWith('"')) {
      if (
        trimmedLabel.includes("(") ||
        trimmedLabel.includes(")") ||
        trimmedLabel.includes("[") ||
        trimmedLabel.includes("]")
      ) {
        const cleanLabel = trimmedLabel.replace(/"/g, '\\"');
        const replacement = `${match.id}${open}"${cleanLabel}"${close}`;
        currentLine =
          currentLine.substring(0, absStart) +
          replacement +
          currentLine.substring(absEnd);
        searchStart = absStart + replacement.length;
        continue;
      }
    }

    searchStart = absEnd;
  }

  return currentLine;
}

export function repairMarkdownMermaidBlocks(markdown: string): string {
  const mermaidRegex = /```mermaid([\s\S]*?)```/g;
  return markdown.replace(mermaidRegex, (match, code) => {
    const repairedCode = repairMermaidSyntax(code);
    return `\`\`\`mermaid\n${repairedCode.trim()}\n\`\`\``;
  });
}
