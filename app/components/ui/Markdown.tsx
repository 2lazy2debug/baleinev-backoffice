import { Fragment } from "react";

import { cn } from "./cn";
import { parseMarkdown, type InlineNode, type MarkdownBlock } from "@/lib/markdown";

/**
 * Rendered Markdown — the read side of any free-form text the app stores
 * (today: an event's info page).
 *
 * Nodes come from `lib/markdown.ts` and are rendered as React elements, so no
 * markup in the source can escape into the page and there is no sanitizer to
 * maintain. Sizes and colors come from the type scale like everywhere else;
 * prose is one step larger than the app's dense UI text because this is the one
 * surface people actually read rather than scan.
 */

const headingClasses: Record<number, string> = {
  1: "text-lg font-semibold sm:text-xl",
  2: "text-base font-semibold sm:text-lg",
  3: "text-sm font-semibold sm:text-base",
  4: "text-sm font-semibold sm:text-base",
  5: "text-sm font-semibold sm:text-base",
  6: "text-sm font-semibold sm:text-base",
};

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <Fragment key={index}>{node.value}</Fragment>;
          case "strong":
            return (
              <strong key={index} className="font-semibold text-[var(--ink)]">
                <Inline nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={index} className="italic">
                <Inline nodes={node.children} />
              </em>
            );
          case "code":
            return (
              <code key={index} className="rounded-sm bg-[var(--panel-strong)] px-1 py-0.5 font-mono text-xs">
                {node.value}
              </code>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                <Inline nodes={node.children} />
              </a>
            );
          case "break":
            return <br key={index} />;
        }
      })}
    </>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return (
        <Tag className={cn("text-[var(--ink)]", headingClasses[block.level])}>
          <Inline nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <Inline nodes={block.children} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 border-[var(--line)] pl-3 text-[var(--muted)]">
          <Inline nodes={block.children} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-xl bg-[var(--panel-strong)] p-3 font-mono text-xs">
          <code>{block.value}</code>
        </pre>
      );
    case "rule":
      return <hr className="border-[var(--line)]" />;
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-[var(--ink)] sm:text-base", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
