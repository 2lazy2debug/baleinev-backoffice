import { MobileAccountMenu } from "@/components/mobile/mobile-account-menu";

import { cn } from "./cn";

type PageHeaderProps = {
  /** Small uppercase label above the title — the section this page belongs to. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /**
   * What this screen is for. Desktop-only on purpose (see the component note):
   * a description that carries *direction* rather than explanation belongs in
   * an <EmptyPage>, not here.
   */
  description?: React.ReactNode;
  /** Page-level actions, right-aligned next to the title. */
  actions?: React.ReactNode;
  /**
   * The header's own control row — a <SegmentedControl>, a search field, a
   * period switcher. Rendered under the title, inside the mobile top bar, so it
   * stays reachable while the content scrolls under it.
   */
  controls?: React.ReactNode;
  className?: string;
};

/**
 * The one page heading — two shapes, one component.
 *
 * On desktop it is a title block in the page flow: eyebrow, large title,
 * description, actions on the right.
 *
 * Below `lg` — the breakpoint where the sidebar becomes the bottom bar — it is
 * the screen's **top bar**: full-bleed, pinned to the top of the viewport, one
 * surface step lighter than the page so content scrolls under it, and closed by
 * a rule instead of by whitespace. A phone has no sidebar to name the screen
 * and ~800px of height to spend, so the title names it in a strip; a 30px title
 * over a paragraph over 32px of air would cost a quarter of the viewport before
 * the first row of data.
 *
 * The bleed (`-mx-3 -mt-3`) cancels the `p-3` gutter that <main> sets below `lg`
 * in `app-shell.tsx`. That gutter and this bleed are one decision — change them
 * together.
 *
 * Being the top bar is also why the account control hangs off it below `lg`: the
 * bottom bar is apps, and the one place that is level with the screen's name is
 * here. <MobileAccountMenu> reads what it needs from the shell's context, so no
 * page has to know about it — and it renders nothing above `lg`, where the
 * sidebar already carries account, language, edition and sign out.
 */
export function PageHeader({ eyebrow, title, description, actions, controls, className }: PageHeaderProps) {
  return (
    <header
      /* What <scrollToBelowTopBar> measures — see scroll.ts. */
      data-top-bar=""
      className={cn(
        "sticky top-0 z-20 -mx-3 -mt-3 border-b border-[var(--line)] bg-[var(--panel)] px-3 pb-2.5 pt-3",
        "lg:static lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 lg:gap-4">
        {/* Below `lg` this is the bar's own line — the screen's name at one end,
            the account at the other — so page actions wrap underneath it instead
            of pushing the account control onto a second row. `lg:contents`
            dissolves it above `lg`, where there is no account control to place. */}
        <div className="flex w-full items-start justify-between gap-3 lg:contents">
          <div className="min-w-0 space-y-0.5 lg:space-y-2">
            {eyebrow ? (
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] lg:text-xs lg:tracking-[0.22em]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight lg:text-3xl">{title}</h1>
            {description ? (
              <p className="hidden max-w-3xl text-sm leading-7 text-[var(--muted)] lg:block">{description}</p>
            ) : null}
          </div>
          <MobileAccountMenu />
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {/* `lg:contents` dissolves the wrapper on desktop, so a control row that is
          mobile-only (a tab strip) leaves no margin behind above `lg`. */}
      {controls ? <div className="mt-3 lg:contents">{controls}</div> : null}
    </header>
  );
}
