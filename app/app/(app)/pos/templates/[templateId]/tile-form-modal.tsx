"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormError } from "@/components/form-error";
import { useCloseOnSuccess } from "@/components/use-close-on-success";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Suggest,
  type SuggestOption,
} from "@/components/ui";
import { dictionaries, type Locale } from "@/lib/i18n-dictionaries";
import { initialActionState } from "@/lib/server-action-helpers";

import {
  ArticleFormModal,
  type ConversionOption,
  type CreatedArticle,
  type UnitOption,
} from "../../../articles/article-form-modal";
import { addPosTemplateCellAction, updatePosTemplateCellAction } from "../../actions";

export type ArticleOption = {
  id: string;
  name: string;
  brand: string | null;
  /** The size of one piece, already written out: "50 cl", "1.5 l". */
  piece: string;
};

/** One tile of the stack, as the editor holds it. */
export type EditorCell = {
  id: string;
  kind: "ARTICLE" | "SPACER";
  elementId: string | null;
  label: string;
  /** A `Decimal(10,2)` as a string — "4.00", "-2.00". */
  price: string;
};

/**
 * Two rows the picker offers that are not articles. They are `pinnedOptions`,
 * so they survive a query that matches nothing — which is exactly when the one
 * that creates an article is needed.
 */
const SPACER_OPTION_ID = "__whitespace__";
const CREATE_OPTION_ID = "__create_article__";

const FORM_ID = "pos-tile-form";

type Props = {
  locale: Locale;
  templateId: string;
  articles: ArticleOption[];
  units: UnitOption[];
  conversions: ConversionOption[];
  open: boolean;
  /** The tile being edited, or null to add one to the end of the stack. */
  cell: EditorCell | null;
  onClose: () => void;
};

type Draft = {
  kind: "ARTICLE" | "SPACER";
  elementId: string;
  articleQuery: string;
  label: string;
  price: string;
};

const blank: Draft = { kind: "ARTICLE", elementId: "", articleQuery: "", label: "", price: "" };

/**
 * What a tile is, in one dialog — the same one for adding and for editing, the
 * way every other create/edit pair in this app works.
 *
 * The picker is the whole screen's interesting part. The catalogue runs to
 * hundreds of rows, so it is searched rather than scrolled, and it submits the
 * article's **id**: two articles can read the same name, and the brand and the
 * size of one piece are what tell them apart — the same beer in 33 cl and in
 * 50 cl is two rows and the tile has to point at the right one.
 *
 * Two rows in that list are not articles at all:
 *
 *   * **Whitespace** turns the tile into a spacer — a place in the stack with
 *     nothing behind it, which is how an author pushes what follows onto the
 *     next row or the next page. It belongs in this list because "what goes in
 *     this tile" is the question the field already asks.
 *   * **New article** opens the catalogue's own dialog over this one and
 *     selects whatever it creates. A bar being set up the evening before finds
 *     the missing article here, not three screens away, and the article that
 *     comes back is a real catalogue row — same form, same rules, barcode scan
 *     included.
 */
export function TileFormModal({
  locale,
  templateId,
  articles,
  units,
  conversions,
  open,
  cell,
  onClose,
}: Props) {
  const copy = dictionaries[locale].pos;
  const shell = dictionaries[locale].shell;
  const router = useRouter();

  // Articles made from inside this dialog. They are real catalogue rows, but
  // the page's own list is a snapshot taken before they existed, so they are
  // held here until the refresh that follows the save brings them along.
  const [created, setCreated] = useState<ArticleOption[]>([]);
  // The name the picker was showing when "New article" was chosen — the
  // catalogue dialog opens with it already filled in.
  const [creatingArticle, setCreatingArticle] = useState<string | null>(null);

  const known = useMemo(() => [...created, ...articles], [created, articles]);
  const articleName = useMemo(() => new Map(known.map((article) => [article.id, article.name])), [known]);

  const articleOptions = useMemo<SuggestOption[]>(
    () =>
      known.map((article) => ({
        id: article.id,
        value: article.name,
        label: article.name,
        hint: [article.brand, article.piece].filter(Boolean).join(" · "),
      })),
    [known],
  );

  const [state, formAction, pending] = useActionState(
    cell ? updatePosTemplateCellAction : addPosTemplateCellAction,
    initialActionState,
  );

  const close = useCallback(() => {
    setCreatingArticle(null);
    onClose();
    router.refresh();
  }, [onClose, router]);

  const markSubmitted = useCloseOnSuccess(state, pending, close);

  // Controlled so picking an article can prefill the still-editable label. Reset
  // during render when the dialog points at a different tile (the pattern from
  // article-form-modal).
  const cellKey = open ? (cell?.id ?? "new") : null;
  const [formKey, setFormKey] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(blank);

  if (cellKey !== formKey) {
    setFormKey(cellKey);
    setForm(
      cell
        ? {
            kind: cell.kind,
            elementId: cell.elementId ?? "",
            articleQuery:
              cell.kind === "SPACER" ? copy.whitespace : (articleName.get(cell.elementId ?? "") ?? ""),
            label: cell.label,
            price: cell.price,
          }
        : blank,
    );
  }

  const pinnedOptions = useMemo<SuggestOption[]>(() => {
    const typed = form.articleQuery.trim();
    return [
      // No hint on this one: <Suggest> draws a hint `shrink-0`, so a sentence
      // there would push the label out of its own row. What whitespace is gets
      // said in the dialog once it is picked.
      { id: SPACER_OPTION_ID, value: copy.whitespace, label: copy.whitespace },
      {
        id: CREATE_OPTION_ID,
        value: typed,
        label: typed ? copy.createArticleNamed.replace("{name}", typed) : copy.createArticle,
        hint: copy.createArticleHint,
      },
    ];
  }, [copy, form.articleQuery]);

  function pickArticle(option: SuggestOption) {
    if (option.id === SPACER_OPTION_ID) {
      setForm({ ...blank, kind: "SPACER", articleQuery: copy.whitespace });
      return;
    }

    if (option.id === CREATE_OPTION_ID) {
      setCreatingArticle(option.value);
      return;
    }

    const elementId = option.id ?? "";
    setForm((current) => {
      const previousName = articleName.get(current.elementId);
      const labelUntouched = current.label.trim() === "" || current.label === previousName;
      const name = articleName.get(elementId) ?? option.value;
      return {
        ...current,
        kind: "ARTICLE",
        elementId,
        articleQuery: name,
        label: labelUntouched ? name : current.label,
      };
    });
  }

  // Typing past the picked row unpicks it — and takes the tile back out of
  // whitespace. The article is a closed list, and a field reading "Bee" while
  // the form still carries the last article saves the wrong tile silently, so
  // Save stays disabled until a row is picked again.
  function searchArticles(query: string) {
    setForm((current) => ({
      ...current,
      kind: "ARTICLE",
      articleQuery: query,
      elementId: query === articleName.get(current.elementId) ? current.elementId : "",
    }));
  }

  function handleCreatedArticle(article: CreatedArticle) {
    setCreated((current) => [{ ...article }, ...current]);
    setForm((current) => ({
      ...current,
      kind: "ARTICLE",
      elementId: article.id,
      articleQuery: article.name,
      label: current.label.trim() === "" ? article.name : current.label,
    }));
  }

  const isSpacer = form.kind === "SPACER";
  const canSave = isSpacer || form.elementId !== "";

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={cell ? copy.editTile : copy.addTile}
        size="sm"
        mobileFullScreen
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>
              {shell.cancel}
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending || !canSave}>
              {shell.save}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} action={formAction} onSubmit={markSubmitted} className="space-y-4">
          <FormError message={state.error} />
          <input type="hidden" name="templateId" value={templateId} />
          {cell ? <input type="hidden" name="cellId" value={cell.id} /> : null}
          <input type="hidden" name="kind" value={form.kind} />

          <Field label={copy.article}>
            <input type="hidden" name="elementId" value={isSpacer ? "" : form.elementId} />
            <Suggest
              value={form.articleQuery}
              onValueChange={searchArticles}
              onPick={pickArticle}
              options={articleOptions}
              pinnedOptions={pinnedOptions}
              openOnFocus
              maxOptions={10}
              placeholder={copy.searchArticles}
            />
          </Field>

          {isSpacer ? (
            <Alert tone="info">{copy.whitespaceHint}</Alert>
          ) : (
            <>
              <Field label={copy.tileLabel}>
                <Input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  required
                />
              </Field>

              <Field label={copy.price}>
                <Input
                  type="text"
                  inputMode="decimal"
                  name="price"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  required
                />
              </Field>
              <p className="text-xs text-[var(--muted)]">{copy.priceHint}</p>
            </>
          )}
        </form>
      </Modal>

      {/* Opened over this dialog, not in place of it: the tile being written is
          still half-filled, and the article is only the field it was missing.
          <Modal> keeps Escape on whichever dialog is on top. */}
      <ArticleFormModal
        locale={locale}
        units={units}
        conversions={conversions}
        open={creatingArticle !== null}
        defaultName={creatingArticle ?? ""}
        onClose={() => setCreatingArticle(null)}
        onCreated={handleCreatedArticle}
        item={null}
      />
    </>
  );
}
