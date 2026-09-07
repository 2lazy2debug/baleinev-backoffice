import { describe, expect, it } from "vitest";

import { parseMarkdown, safeHref, type InlineNode } from "./markdown";

/** Flattens a node tree back to its visible text — what a reader would see. */
function text(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        case "break":
          return "\n";
        default:
          return text(node.children);
      }
    })
    .join("");
}

describe("blocks", () => {
  it("reads headings, paragraphs, lists, quotes, code and rules", () => {
    const blocks = parseMarkdown(
      [
        "# Briefing",
        "",
        "Meet at the gate.",
        "Ask for Marie.",
        "",
        "- badge",
        "- radio",
        "",
        "1. sign in",
        "2. take a radio",
        "",
        "> No parking on site.",
        "",
        "```",
        "code line",
        "```",
        "",
        "---",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "code",
      "rule",
    ]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    // Two lines of one paragraph stay two lines.
    expect(text((blocks[1] as { children: InlineNode[] }).children)).toBe("Meet at the gate.\nAsk for Marie.");
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[3] as { items: InlineNode[][] }).items.map(text)).toEqual(["sign in", "take a radio"]);
    expect(blocks[5]).toEqual({ type: "code", value: "code line" });
  });

  it("starts a new block without a blank line before it", () => {
    const blocks = parseMarkdown("Bring:\n- badge");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "list"]);
  });
});

describe("inline", () => {
  it("reads bold, italic, code and links", () => {
    const [paragraph] = parseMarkdown("**Bold** and *italic* and `code` and [site](https://example.com).");
    const kinds = (paragraph as { children: InlineNode[] }).children.map((node) => node.type);
    expect(kinds).toEqual(["strong", "text", "em", "text", "code", "text", "link", "text"]);
  });

  it("leaves snake_case words alone", () => {
    const [paragraph] = parseMarkdown("the cost_center_id field");
    expect((paragraph as { children: InlineNode[] }).children).toEqual([
      { type: "text", value: "the cost_center_id field" },
    ]);
  });

  it("keeps raw HTML as literal text — nothing here becomes markup", () => {
    const [paragraph] = parseMarkdown("<script>alert(1)</script>");
    expect(text((paragraph as { children: InlineNode[] }).children)).toBe("<script>alert(1)</script>");
  });
});

describe("safeHref", () => {
  it.each(["https://example.com", "http://example.com", "mailto:a@b.ch", "tel:+41", "/events", "#event-1"])(
    "keeps %s",
    (href) => {
      expect(safeHref(href)).toBe(href);
    },
  );

  it.each(["javascript:alert(1)", "data:text/html,<script>", "  "])("refuses %s", (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it("renders a refused link as the text that was typed", () => {
    const [paragraph] = parseMarkdown("[click](javascript:alert(1))");
    const children = (paragraph as { children: InlineNode[] }).children;
    expect(children.every((node) => node.type !== "link")).toBe(true);
    expect(text(children)).toContain("[click]");
  });
});
