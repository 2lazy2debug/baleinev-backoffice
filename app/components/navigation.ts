/**
 * The shape of the app's navigation, shared by the two surfaces that render it:
 * the desktop sidebar (`app-shell.tsx`) and the mobile apps sheet
 * (`mobile/mobile-shell.tsx`). AppShell builds the array once, per role, and
 * hands the same one to both — a nav item added there shows up in both places.
 */
export type NavigationItem =
  | {
      type: "item";
      href: string;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  | {
      type: "divider";
      key: string;
    };

export type EditionOption = {
  id: string;
  name: string;
  isClosed: boolean;
};
