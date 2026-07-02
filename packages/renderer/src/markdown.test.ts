import { describe, expect, it } from "vitest";
import {
  repairMermaidSyntax,
  parseMarkdown,
  repairMarkdownMermaidBlocks,
} from "./markdown";

describe("repairMermaidSyntax", () => {
  it("should replace single arrow '->' with '-->' outside of quotes", () => {
    const input = `
graph TD
  A -> B
  C  ->  D
  E["A -> B"] --> F
`;
    const expected = `
graph TD
  A --> B
  C --> D
  E["A -> B"] --> F
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });

  it("should wrap unquoted node labels containing parentheses in double quotes", () => {
    const input = `
graph TD
  A[Client (TCP)] --> B(Server (HTTP))
  C{Router (API)} --> D([Stadium (Label)])
`;
    const expected = `
graph TD
  A["Client (TCP)"] --> B("Server (HTTP)")
  C{"Router (API)"} --> D(["Stadium (Label)"])
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });

  it("should not double-quote labels that are already quoted", () => {
    const input = `
graph TD
  A["Client (TCP)"] --> B("Server (HTTP)")
`;
    const expected = `
graph TD
  A["Client (TCP)"] --> B("Server (HTTP)")
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });

  it("should ignore lines starting with comment marker '%%'", () => {
    const input = `
graph TD
  %% A -> B
  A -> B
`;
    const expected = `
graph TD
  %% A -> B
  A --> B
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });

  it("should wrap unquoted subgraph titles containing parentheses in double quotes", () => {
    const input = `
graph TD
  subgraph BuildTime [ビルドタイム (Cargo / build.rs)]
    A --> B
  end
`;
    const expected = `
graph TD
  subgraph BuildTime ["ビルドタイム (Cargo / build.rs)"]
    A --> B
  end
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });

  it("should repair parentheses in link text", () => {
    const input = `
graph TD
  A -->|2. Cargo IPC (cargo:rustc-env / rerun-if-changed)| B
`;
    const expected = `
graph TD
  A -->|2. Cargo IPC - cargo:rustc-env / rerun-if-changed| B
`;
    expect(repairMermaidSyntax(input).trim()).toBe(expected.trim());
  });
});

describe("parseMarkdown with Mermaid rendering integration", () => {
  it("should parse markdown containing bad mermaid and return repaired HTML", () => {
    const markdown = `
# Title

\`\`\`mermaid
graph TD
  A[Client (TCP)] -> B
\`\`\`
`;
    const html = parseMarkdown(markdown);
    // The rendered html should contain the repaired mermaid code
    expect(html).toContain(
      '<div class="mermaid">graph TD\n  A["Client (TCP)"] --> B</div>',
    );
  });
});

describe("repairMarkdownMermaidBlocks", () => {
  it("should only modify mermaid blocks and leave Rust blocks unmodified", () => {
    const input = `
# Article

Some text with -> arrow.

\`\`\`rust
fn test() -> Result<(), Error> {
  let x = A -> B; // wait, invalid rust but checks ->
}
\`\`\`

\`\`\`mermaid
graph TD
  A[Client (TCP)] -> B
\`\`\`
`;
    const expected = `
# Article

Some text with -> arrow.

\`\`\`rust
fn test() -> Result<(), Error> {
  let x = A -> B; // wait, invalid rust but checks ->
}
\`\`\`

\`\`\`mermaid
graph TD
  A["Client (TCP)"] --> B
\`\`\`
`;
    expect(repairMarkdownMermaidBlocks(input).trim()).toBe(expected.trim());
  });
});
