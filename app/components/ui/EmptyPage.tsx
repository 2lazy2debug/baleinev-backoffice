import { Card } from "./Card";
import { PageHeader } from "./PageHeader";

type EmptyPageProps = {
  /** Small uppercase label above the title — the section this page belongs to. */
  eyebrow?: React.ReactNode;
  /** What is missing, stated plainly ("No edition selected"). */
  title: React.ReactNode;
  /** What to do about it. */
  children: React.ReactNode;
};

/**
 * A whole screen that has nothing to show yet — no edition picked, a vault that
 * was never configured.
 *
 * It exists because <PageHeader>'s description is desktop chrome: it explains a
 * screen to someone with room to read it, and the mobile top bar drops it. The
 * one line a phone user actually needs on these screens is the *direction*, so
 * here it is content — a dashed empty-state card — not a subtitle.
 */
export function EmptyPage({ eyebrow, title, children }: EmptyPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card dashed>{children}</Card>
    </div>
  );
}
