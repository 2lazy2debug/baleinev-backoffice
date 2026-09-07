/**
 * A small Markdown parser for the text admins write into an event's info page.
 *
 * It produces a node tree, never an HTML string: the renderer in
 * `components/ui/Markdown.tsx` turns these nodes into React elements, so there
 * is no `dangerouslySetInnerHTML` anywhere and no sanitizer to keep in sync.
 * Anything this parser does not know about — raw HTML included — survives as
 * literal text, which is the safe failure mode.
 *
 * The subset is what a briefing note actually uses: headings, paragraphs,
 * lists, quotes, fenced code, rules, and inline bold/italic/code/links.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "break" };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "rule" };

/**
 * Links are the one place a Markdown document can name a destination, so this
 * is the allowlist: the web, mail, phone, and this app's own paths. A
 * `javascript:` href is not rejected but demoted — the link renders as the
 * literal text that was typed, which is both safe and visible.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^[/#]/.test(href)) return href;
  return null;
}

const linkPattern = /^\[([^\]]*)\]\(([^)\s]+)\)/;

function isWordChar(char: string | undefined) {
  return char !== undefined && /[\w]/.test(char);
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";

  function flush() {
    if (buffer) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  }

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // Code first: inside backticks nothing else is markup.
    if (rest.startsWith("`")) {
      const end = rest.indexOf("`", 1);
      if (end > 1) {
        flush();
        nodes.push({ type: "code", value: rest.slice(1, end) });
        i += end + 1;
        continue;
      }
    }

    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(rest.slice(2, end)) });
        i += end + 2;
        continue;
      }
    }

    // `_` only delimits emphasis at a word boundary, so snake_case_names stay
    // themselves instead of turning half a word italic.
    const marker = rest[0];
    if (marker === "*" || (marker === "_" && !isWordChar(text[i - 1]))) {
      const end = rest.indexOf(marker, 1);
      const closesCleanly = end > 1 && rest[end - 1] !== " " && (marker === "*" || !isWordChar(rest[end + 1]));
      if (closesCleanly) {
        flush();
        nodes.push({ type: "em", children: parseInline(rest.slice(1, end)) });
        i += end + 1;
        continue;
      }
    }

    const link = linkPattern.exec(rest);
    if (link) {
      flush();
      const href = safeHref(link[2]);
      if (href) {
        nodes.push({ type: "link", href, children: parseInline(link[1]) });
      } else {
        nodes.push({ type: "text", value: link[0] });
      }
      i += link[0].length;
      continue;
    }

    buffer += text[i];
    i += 1;
  }

  flush();
  return nodes;
}

/** Lines of one paragraph or quote, kept as separate visual lines. */
function parseLines(lines: string[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "break" });
    nodes.push(...parseInline(line));
  });
  return nodes;
}

const headingPattern = /^(#{1,6})\s+(.*)$/;
const unorderedPattern = /^\s*[-*+]\s+(.*)$/;
const orderedPattern = /^\s*\d+[.)]\s+(.*)$/;
const rulePattern = /^\s*([-*_])\s*(\1\s*){2,}$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code. An unclosed fence runs to the end of the document rather
    // than falling back to paragraphs, which is what the author meant.
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", value: body.join("\n") });
      continue;
    }

    if (rulePattern.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        body.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", children: parseLines(body) });
      continue;
    }

    const startsList = unorderedPattern.exec(line) ?? orderedPattern.exec(line);
    if (startsList) {
      const ordered = orderedPattern.test(line);
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const match = ordered ? orderedPattern.exec(lines[i]) : unorderedPattern.exec(lines[i]);
        if (!match) break;
        items.push(parseInline(match[1]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: everything up to a blank line or the start of another block.
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      body.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseLines(body) });
  }

  return blocks;
}

function isBlockStart(line: string) {
  return (
    line.trim().startsWith("```") ||
    rulePattern.test(line) ||
    headingPattern.test(line) ||
    line.trimStart().startsWith(">") ||
    unorderedPattern.test(line) ||
    orderedPattern.test(line)
  );
}
