/**
 * Rebuilds the 2025-2026 Coffre (cash box) ledger from the partial paper trail
 * and emits the review page + the import file.
 *
 *   node docs/accounting-mess/build-coffre-reconciliation.mjs
 *     -> docs/accounting-mess/final-result.html   (review this first)
 *     -> docs/accounting-mess/final-result.csv    (the rows to book)
 *
 * WHY THIS EXISTS
 * ---------------
 * The bank side of the 2025-2026 journal is complete and correct (imported from
 * the BCV statement). The cash box is not: only 23 Coffre entries were ever
 * booked, and the movements in between live in three spreadsheets and one
 * hand-written note. What we do have is a handful of dates where the box was
 * physically counted. So: replay every movement we can source, and where the
 * replay misses a count, book the difference as one dated balancing entry.
 *
 * The opening balance (1'995.65 at 28.07.2025) is already on MoneyAccount
 * "Coffre" as `openingBalance`, so it is NOT a journal row here.
 *
 * SIGN CONVENTION
 * ---------------
 * `sign: +1` -> PRODUITS, money enters the box. `sign: -1` -> CHARGES, money
 * leaves it. A festival till is floated OUT of the box in the morning
 * (CHARGES) and the whole till is counted back IN at night (PRODUITS); the
 * day's profit is the difference, which is why both legs are booked gross.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ money */

/** Everything is integer centimes internally — floats do not sum to a count. */
const c = (chf) => Math.round(chf * 100);
const chf = (cents) =>
  (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------- the target */

/** Physical counts of the box. These are the constraints the replay must hit. */
const COUNTS = [
  { date: "2025-07-28", cents: c(1995.65), what: "Solde d'ouverture, compté à la main", opening: true },
  { date: "2025-11-09", cents: c(1851.3), what: "Comptage du coffre" },
  { date: "2025-12-08", cents: c(4180.3), what: "Comptage du coffre, après le Marché de Noël" },
  { date: "2026-03-30", cents: c(5923.85), what: "Comptage du coffre, après la Semaine du Vin Chaud" },
  { date: "2026-04-12", cents: c(7033.9), what: "Comptage du coffre, après vidange des caisses" },
  { date: "2026-05-05", cents: c(8990.0), what: "Comptage du coffre" },
  { date: "2026-06-30", cents: c(937.8), what: "Solde final, compté à la main", final: true },
];

/**
 * Where the balancing entry for the interval ending at each count is dated.
 * Rule: the last month-end that falls inside the interval — the balancing
 * entry is a month-end operation, and putting it before the count keeps the
 * counted balance exact on the day it was counted.
 *
 * 2026-06-30 is the one deliberate exception: applying the rule would date the
 * last balancing entry 30.06, leaving the box at -1'270.35 from 21.05 to 30.06.
 * The 10'260.35 banked on 21.05 proves the festival cash was in the box before
 * that date, so the entry goes to the previous month-end, 31.05.
 */
const BALANCE_DATE_OVERRIDE = { "2026-06-30": "2026-05-31" };

/* ------------------------------------------------------ sourced movements */

const TXT = "historique caisse partiel.txt";
const FDC = "historique_fond_de_caisse.xlsx · Comptage caisse (machine)";
const MDN = "Compta_MDN_2025.xlsx · FDC";
const SVC_CHZ = "Compta_SVC_2025.xlsx · FDC CHESEAUX";
const SVC_STR = "Compta_SVC_2025.xlsx · FDC ST ROCH";

/** One festival day: float out in the morning, till counted back in at night. */
const tillDay = (date, out, back, who, costCenter, source) => [
  { date, sign: -1, cents: c(out), label: `${who} : fonds de caisse sorti`, costCenter, source },
  { date, sign: +1, cents: c(back), label: `${who} : caisse comptée, rentrée au coffre`, costCenter, source },
];

const SOURCED = [
  {
    date: "2025-09-10",
    sign: -1,
    cents: c(400),
    label: "Manque à gagner constaté au coffre",
    costCenter: "INTERNE",
    source: TXT,
  },

  // Marché de Noël 2025, Yverdon — 29.11 to 07.12. Daily floats and closing
  // counts, both confirmed by the "Total fdc" / "Total" rows of the workbook.
  ...tillDay("2025-11-29", 1390, 1954, "MDN 29.11", "MDN", MDN),
  ...tillDay("2025-11-30", 1114, 1242, "MDN 30.11", "MDN", MDN),
  ...tillDay("2025-12-01", 1002, 1122, "MDN 01.12", "MDN", MDN),
  ...tillDay("2025-12-02", 962, 1033.6, "MDN 02.12", "MDN", MDN),
  ...tillDay("2025-12-03", 953.6, 942.8, "MDN 03.12", "MDN", MDN),
  ...tillDay("2025-12-04", 822.8, 882.8, "MDN 04.12", "MDN", MDN),
  ...tillDay("2025-12-05", 1002.8, 1660.35, "MDN 05.12", "MDN", MDN),
  ...tillDay("2025-12-06", 1042.35, 1356.75, "MDN 06.12", "MDN", MDN),
  ...tillDay("2025-12-07", 956.75, 1037.8, "MDN 07.12", "MDN", MDN),

  // Semaine du Vin Chaud, two stands running in parallel.
  ...tillDay("2025-12-15", 192.5, 289.5, "SVC Chéseaux 15.12", "", SVC_CHZ),
  ...tillDay("2025-12-16", 289.5, 443.5, "SVC Chéseaux 16.12", "", SVC_CHZ),
  ...tillDay("2025-12-17", 443.5, 744.5, "SVC Chéseaux 17.12", "", SVC_CHZ),
  ...tillDay("2025-12-18", 504.5, 1111.3, "SVC Chéseaux 18.12", "", SVC_CHZ),

  ...tillDay("2025-12-15", 190, 254, "SVC St-Roch 15.12", "", SVC_STR),
  ...tillDay("2025-12-16", 254, 306, "SVC St-Roch 16.12", "", SVC_STR),
  ...tillDay("2025-12-17", 306, 340.2, "SVC St-Roch 17.12", "", SVC_STR),
  ...tillDay("2025-12-18", 340.2, 393.6, "SVC St-Roch 18.12", "", SVC_STR),
  // The note dates this fifth St-Roch day 15.12, which cannot be right: its
  // float (393.60) is the 18.12 closing count. The workbook column carries
  // Excel serial 46010 = 19.12.2025, so that is the date used here.
  ...tillDay("2025-12-19", 393.6, 426.1, "SVC St-Roch 19.12", "", SVC_STR),

  // 12.04.2026 — the tills and the donation tin were emptied into the box on
  // the day it was counted. The note only carries the Chéseaux till; the other
  // two come from the counting sheet, and all three together land within a
  // couple of centimes of the count instead of hundreds of francs short.
  { date: "2026-04-12", sign: +1, cents: c(141.65), label: "Vidange crousille", costCenter: "", source: FDC },
  { date: "2026-04-12", sign: +1, cents: c(465), label: "Vidange caisse St-Roch", costCenter: "", source: FDC },
  { date: "2026-04-12", sign: +1, cents: c(504.6), label: "Vidange caisse Chéseaux", costCenter: "", source: `${TXT} + ${FDC}` },

  { date: "2026-04-13", sign: -1, cents: c(495), label: "Sortie du coffre vers la caisse", costCenter: "", source: TXT },
  { date: "2026-04-16", sign: +1, cents: c(1870), label: "Entrées dans le coffre", costCenter: "", source: TXT },

  { date: "2026-06-30", sign: +1, cents: c(382.2), label: "Entrée dans le coffre", costCenter: "", source: TXT },
  { date: "2026-06-30", sign: +1, cents: c(70), label: "Entrée dans le coffre", costCenter: "", source: TXT },
];

/**
 * Movements in the note that are already booked, listed so the reader can see
 * they were considered and dropped rather than missed.
 */
const ALREADY_BOOKED = [
  {
    note: "Sortie du coffre au 27.11.2025 : 263.9",
    entry: "séquence 302 — CHARGES 263.90 du 27.11.2025 (contrepartie du versement bancaire 301)",
  },
];

/**
 * Rows from the counting sheet deliberately left out, with what including them
 * would do. Each one makes its interval reconcile worse, so each is most
 * likely already inside a figure we do book.
 */
const REJECTED = () => [
  {
    what: 'Ligne "Crousille" 88.85 (sans date, entre les comptages du 30.03 et du 12.04)',
    why: `L'ajouter porterait l'équilibrage du 31.03 de ${chf(intervals[3].gap)} à ${chf(WHAT_IF.withCrousille)}. Le montant est vraisemblablement déjà dans un des comptages.`,
  },
  {
    what: 'Lignes "gains stroch cash" 40.00 et "gains chzo cash" 325.00 (sans date, entre le 12.04 et le 05.05)',
    why: `Les ajouter porterait l'équilibrage du 30.04 de ${chf(intervals[4].gap)} à ${chf(WHAT_IF.withGainsCash)}. Vraisemblablement déjà compris dans les 1'870.00 du 16.04.`,
  },
  {
    what: 'Colonne "Gains 280.00" de la feuille FDC ST ROCH (serial 46011 = 20.12.2025, fonds de caisse à 0)',
    why: "La feuille contient des colonnes résiduelles copiées du Marché de Noël (1'042.35 / 1'356.75 …). Celle-ci en a tous les signes et n'apparaît pas dans le relevé manuscrit.",
  },
];

/* ------------------------------------------- what is already in the journal */

const existing = readFileSync(join(HERE, "journal-coffre-existing.psv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [seq, date, , accountType, amount, counterparty, label, , , costCenter] = line.split("|");
    return {
      date,
      sign: accountType === "PRODUITS" ? +1 : -1,
      cents: c(Number(amount)),
      label: label.replace(/''/g, "'") || `(sans libellé) — contrepartie ${counterparty}`,
      costCenter,
      source: `journal, séquence ${seq}`,
      booked: true,
      sequenceNumber: Number(seq),
    };
  });

/* ------------------------------------------------------------- the replay */

const monthEnd = (year, month) => new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

/** Every month-end strictly after `from` and on or before `to`. */
function monthEndsBetween(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  for (;;) {
    const d = monthEnd(y, m);
    if (new Date(`${d}T00:00:00Z`) > end) break;
    if (d > from) out.push(d);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const opening = COUNTS[0];
const movements = [...existing, ...SOURCED];

/** Walk each interval between two counts and size the balancing entry. */
function replay(rows) {
  const out = [];
  let previous = opening;
  for (const count of COUNTS.slice(1)) {
    const inside = rows.filter((m) => m.date > previous.date && m.date <= count.date);
    const moved = inside.reduce((sum, m) => sum + m.sign * m.cents, 0);
    const replayed = previous.cents + moved;
    const gap = count.cents - replayed;

    const candidates = monthEndsBetween(previous.date, count.date);
    const date = BALANCE_DATE_OVERRIDE[count.date] ?? candidates.at(-1);
    if (!date) throw new Error(`No month-end available inside ${previous.date}..${count.date}`);

    const entry = gap === 0 ? null : {
      date,
      sign: gap > 0 ? +1 : -1,
      cents: Math.abs(gap),
      label: "Équilibrage après comptage du coffre",
      costCenter: "INTERNE",
      source: `écart du comptage du ${count.date}`,
      balancing: true,
    };

    out.push({ from: previous, to: count, inside, moved, replayed, gap, entry });
    previous = count;
  }
  return out;
}

const intervals = replay(movements);
const balancing = intervals.map((i) => i.entry).filter(Boolean);

/**
 * What the balancing entry for one count would become under a different set of
 * movements. Every "would be X instead of Y" claim on the page is computed
 * from this rather than typed, so the prose cannot drift from the arithmetic.
 */
const gapAt = (countDate, rows) => replay(rows).find((i) => i.to.date === countDate).gap;
const without = (...labels) => movements.filter((m) => !labels.includes(m.label));
const withExtra = (...extra) => [...movements, ...extra];

const WHAT_IF = {
  /** Drop the 400.00 shortfall and the 31.10.2025 balancing entry flips sign. */
  noManqueAGagner: gapAt("2025-11-09", without("Manque à gagner constaté au coffre")),
  /** Keep only the till the hand-written note carried. */
  chzoVidangeOnly: gapAt("2026-04-12", without("Vidange crousille", "Vidange caisse St-Roch")),
  /** The undated "Crousille 88.85" row of the counting sheet. */
  withCrousille: gapAt(
    "2026-04-12",
    withExtra({ date: "2026-04-12", sign: +1, cents: c(88.85), label: "Crousille", source: FDC }),
  ),
  /** The undated "gains stroch/chzo cash" rows of the counting sheet. */
  withGainsCash: gapAt(
    "2026-05-05",
    withExtra(
      { date: "2026-04-16", sign: +1, cents: c(40), label: "gains stroch cash", source: FDC },
      { date: "2026-04-16", sign: +1, cents: c(325), label: "gains chzo cash", source: FDC },
    ),
  ),
};

/* ------------------------------------------------------------- the ledger */

const NEW_ENTRIES = [...SOURCED, ...balancing].sort(
  (a, b) => a.date.localeCompare(b.date) || (a.balancing ? 1 : 0) - (b.balancing ? 1 : 0),
);

let sequenceNumber = 615; // max(sequenceNumber) in edition 2025-2026 is 614.
for (const e of NEW_ENTRIES) e.sequenceNumber = sequenceNumber++;

/** The whole box, old rows and new, in date order, with a running balance. */
const ledger = [...existing, ...NEW_ENTRIES].sort(
  (a, b) =>
    a.date.localeCompare(b.date) ||
    (a.booked ? 0 : 1) - (b.booked ? 0 : 1) ||
    a.sequenceNumber - b.sequenceNumber,
);

let running = opening.cents;
for (const row of ledger) {
  running += row.sign * row.cents;
  row.balance = running;
}

/* ---------------------------------------------------------------- checks */

const problems = [];
const finalCount = COUNTS.at(-1);
if (running !== finalCount.cents) {
  problems.push(`Solde final ${chf(running)} ≠ solde compté ${chf(finalCount.cents)}`);
}
for (const { to } of intervals) {
  const at = ledger.filter((r) => r.date <= to.date).at(-1);
  const balanceAt = at ? at.balance : opening.cents;
  if (balanceAt !== to.cents) {
    problems.push(`Comptage du ${to.date} : reconstitué ${chf(balanceAt)} ≠ compté ${chf(to.cents)}`);
  }
}
const negative = ledger.filter((r) => r.balance < 0);
/** The box is short from the first negative row until the row that repairs it. */
const negativeUntil = negative.length
  ? (ledger.find((r) => r.date > negative.at(-1).date && r.balance >= 0)?.date ?? finalCount.date)
  : null;

/* ------------------------------------------------------------------- CSV */

const csvCell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [
  ["sequenceNumber", "date", "moneyAccount", "accountType", "amount", "counterparty", "label", "costCenter", "source"],
  ...NEW_ENTRIES.map((e) => [
    e.sequenceNumber,
    e.date,
    "Coffre",
    e.sign > 0 ? "PRODUITS" : "CHARGES",
    (e.cents / 100).toFixed(2),
    "BLV",
    e.label,
    e.costCenter ?? "",
    e.source,
  ]),
]
  .map((row) => row.map(csvCell).join(","))
  .join("\n");

writeFileSync(join(HERE, "final-result.csv"), `${csv}\n`, "utf8");

/* ------------------------------------------------------------------ HTML */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fr = (iso) => iso.split("-").reverse().join(".");

const kind = (row) =>
  row.booked ? { cls: "booked", text: "déjà au journal" }
    : row.balancing ? { cls: "balancing", text: "équilibrage" }
    : { cls: "sourced", text: "à créer" };

const ledgerRows = ledger
  .map((row) => {
    const k = kind(row);
    return `<tr class="${k.cls}">
      <td class="num">${row.booked ? row.sequenceNumber : `<em>${row.sequenceNumber}</em>`}</td>
      <td class="date">${fr(row.date)}</td>
      <td>${esc(row.label)}</td>
      <td class="cc">${esc(row.costCenter || "—")}</td>
      <td class="num in">${row.sign > 0 ? chf(row.cents) : ""}</td>
      <td class="num out">${row.sign < 0 ? chf(row.cents) : ""}</td>
      <td class="num bal${row.balance < 0 ? " neg" : ""}">${chf(row.balance)}</td>
      <td class="src">${esc(row.source)}</td>
      <td><span class="tag ${k.cls}">${k.text}</span></td>
    </tr>`;
  })
  .join("\n");

const intervalRows = intervals
  .map(({ from, to, inside, moved, replayed, gap, entry }) => {
    const sourced = inside.filter((m) => !m.booked).length;
    const booked = inside.filter((m) => m.booked).length;
    return `<tr>
      <td class="date">${fr(from.date)} → ${fr(to.date)}</td>
      <td class="num">${chf(from.cents)}</td>
      <td class="num">${booked} + ${sourced}</td>
      <td class="num ${moved < 0 ? "out" : "in"}">${moved > 0 ? "+" : ""}${chf(moved)}</td>
      <td class="num">${chf(replayed)}</td>
      <td class="num">${chf(to.cents)}</td>
      <td class="num ${gap < 0 ? "out" : "in"}"><strong>${gap > 0 ? "+" : ""}${chf(gap)}</strong></td>
      <td class="date">${entry ? fr(entry.date) : "—"}</td>
    </tr>`;
  })
  .join("\n");

const balancingRows = balancing
  .map(
    (e) => `<tr>
      <td class="num"><em>${e.sequenceNumber}</em></td>
      <td class="date">${fr(e.date)}</td>
      <td>${e.sign > 0 ? "PRODUITS" : "CHARGES"}</td>
      <td class="num ${e.sign > 0 ? "in" : "out"}"><strong>${chf(e.cents)}</strong></td>
      <td>${esc(e.label)}</td>
    </tr>`,
  )
  .join("\n");

const html = `<title>Coffre 2025-2026 — reconstitution</title>
<style>
  :root {
    --page: #0f171f; --panel: #152330; --panel-strong: #1c2d3d; --line: #2e4256;
    --ink: #eaf1f8; --muted: #9cb0c4; --accent: #00a68c; --accent-strong: #008a74;
    --rose: #fda4af; --rose-bg: rgba(76, 5, 25, .35); --rose-line: rgba(251, 113, 133, .3);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 20px 64px; background: var(--page); color: var(--ink);
    font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  header { margin-bottom: 24px; }
  .eyebrow { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: 28px; margin: 4px 0 8px; letter-spacing: -.01em; }
  h2 { font-size: 17px; margin: 0; }
  p { margin: 0 0 10px; color: var(--muted); max-width: 78ch; }
  p strong, li strong { color: var(--ink); }
  section { margin-top: 28px; }
  .panel { border: 1px solid var(--line); background: var(--panel); border-radius: 10px; overflow: hidden; }
  .panel-head { padding: 12px 16px; border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  .panel-head .hint { font-size: 11px; color: var(--muted); }
  .panel-body { padding: 16px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { padding: 5px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  thead th {
    position: sticky; top: 0; background: var(--panel-strong); color: var(--muted);
    font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .date { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .in { color: var(--accent); }
  .out { color: var(--rose); }
  .bal { font-weight: 600; }
  .bal.neg { color: var(--rose); }
  .cc, .src { color: var(--muted); font-size: 11px; }
  tr.booked td { opacity: .62; }
  tr.balancing { background: rgba(0, 166, 140, .07); }
  tr.balancing td { font-weight: 500; }
  .tag {
    display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px;
    white-space: nowrap; border: 1px solid var(--line); color: var(--muted);
  }
  .tag.sourced { border-color: rgba(0, 166, 140, .45); color: var(--accent); }
  .tag.balancing { border-color: var(--accent); color: var(--ink); background: rgba(0, 166, 140, .18); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
  .card { border: 1px solid var(--line); background: var(--panel); border-radius: 10px; padding: 12px 14px; }
  .card .k { font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
  .card .v { font-size: 21px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .card .n { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .ok { border-color: rgba(0, 166, 140, .45); }
  .ok .v { color: var(--accent); }
  .alert { border: 1px solid var(--rose-line); background: var(--rose-bg); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
  .alert h3 { margin: 0 0 6px; font-size: 13px; color: var(--rose); }
  .alert p, .alert li { color: var(--ink); margin: 0 0 4px; }
  ul { margin: 0; padding-left: 18px; color: var(--muted); }
  li { margin-bottom: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; background: var(--panel-strong); padding: 1px 5px; border-radius: 3px; color: var(--ink); }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--muted); margin-top: 10px; }
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Baleinev · édition 2025-2026 · compte Coffre</div>
  <h1>Reconstitution du coffre</h1>
  <p>Le compte bancaire est complet et juste — il vient du relevé BCV. Le coffre ne l'est pas :
  23 écritures seulement avaient été passées sur l'année. Cette page rejoue tous les mouvements
  retrouvés dans <code>historique caisse partiel.txt</code>, <code>historique_fond_de_caisse.xlsx</code>
  et les deux classeurs Marché de Noël / Semaine du Vin Chaud, puis comble chaque écart contre un
  comptage physique par une écriture d'<strong>équilibrage datée d'une fin de mois</strong>.</p>
</header>

<section>
  <div class="cards">
    <div class="card"><div class="k">Solde d'ouverture</div><div class="v">${chf(opening.cents)}</div><div class="n">28.07.2025, compté</div></div>
    <div class="card"><div class="k">Écritures existantes</div><div class="v">${existing.length}</div><div class="n">inchangées</div></div>
    <div class="card"><div class="k">Écritures à créer</div><div class="v">${NEW_ENTRIES.length}</div><div class="n">dont ${balancing.length} équilibrages · séq. 615-${sequenceNumber - 1}</div></div>
    <div class="card ${problems.length ? "" : "ok"}"><div class="k">Solde final reconstitué</div><div class="v">${chf(running)}</div><div class="n">${problems.length ? "≠ comptage" : `= comptage du ${fr(finalCount.date)} ✓`}</div></div>
  </div>
</section>

${problems.length ? `<section><div class="alert"><h3>La reconstitution ne boucle pas</h3><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div></section>` : ""}

${negative.length ? `<section>
  <div class="alert">
    <h3>Solde négatif du ${fr(negative[0].date)} au ${fr(negativeUntil)}</h3>
    <p>Les ${chf(c(10260.35))} versés à la banque le 21.05.2026 dépassent les ${chf(c(8990))} comptés le 05.05.2026 :
    la recette cash du festival est bien entrée au coffre entre ces deux dates, mais aucune source ne la date.
    L'équilibrage de ${chf(balancing.at(-1).cents)} est donc daté du <strong>31.05.2026</strong> (dernière fin de mois avant
    le comptage final) et non du 30.06 — ce qui ramène la période négative de cinq semaines à dix jours.
    Le solde plonge malgré tout à ${chf(Math.min(...negative.map((r) => r.balance)))} du 21.05 au 31.05.</p>
    <p><strong>Si vous retrouvez la date du dépôt des recettes du festival au coffre</strong>, remplacez cet
    équilibrage par une entrée datée et la période négative disparaît.</p>
  </div>
</section>` : ""}

<section>
  <div class="panel">
    <div class="panel-head"><h2>Écart par période</h2><span class="hint">entre deux comptages physiques</span></div>
    <div class="scroll"><table>
      <thead><tr>
        <th>Période</th><th class="num">Solde compté au départ</th><th class="num">Mouvements (journal + sourcés)</th>
        <th class="num">Net</th><th class="num">Solde reconstitué</th><th class="num">Solde compté</th>
        <th class="num">Écart à équilibrer</th><th>Écriture datée du</th>
      </tr></thead>
      <tbody>${intervalRows}</tbody>
    </table></div>
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head"><h2>Les ${balancing.length} écritures d'équilibrage</h2><span class="hint">« Équilibrage après comptage du coffre » · centre de charge INTERNE</span></div>
    <div class="scroll"><table>
      <thead><tr><th class="num">Séq.</th><th>Date</th><th>Sens</th><th class="num">Montant</th><th>Libellé</th></tr></thead>
      <tbody>${balancingRows}</tbody>
    </table></div>
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head">
      <h2>Journal du coffre</h2>
      <span class="hint">${ledger.length} lignes, par date, solde courant à droite</span>
    </div>
    <div class="scroll"><table>
      <thead><tr>
        <th class="num">Séq.</th><th>Date</th><th>Libellé</th><th>CC</th>
        <th class="num">Entrée</th><th class="num">Sortie</th><th class="num">Solde</th><th>Source</th><th></th>
      </tr></thead>
      <tbody>
        <tr class="booked"><td class="num">—</td><td class="date">${fr(opening.date)}</td><td><strong>Solde d'ouverture</strong></td><td class="cc">—</td><td class="num"></td><td class="num"></td><td class="num bal">${chf(opening.cents)}</td><td class="src">MoneyAccount.openingBalance</td><td><span class="tag">ouverture</span></td></tr>
${ledgerRows}
      </tbody>
    </table></div>
  </div>
  <div class="legend">
    <span><span class="tag">déjà au journal</span> existant en production, non modifié</span>
    <span><span class="tag sourced">à créer</span> retrouvé dans une source, à passer</span>
    <span><span class="tag balancing">équilibrage</span> écart non documenté, fin de mois</span>
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head"><h2>Décisions prises sur des données ambiguës</h2><span class="hint">à valider avant mise en production</span></div>
    <div class="panel-body">
      <ul>
        <li><strong>Cinquième jour St-Roch daté au 19.12.2025.</strong> Le relevé manuscrit le date du 15.12, mais
        son fonds de caisse (393.60) est exactement le comptage de clôture du 18.12, et la colonne du classeur
        porte le sérial Excel 46010 = 19.12.2025. Sans effet sur les comptages : les deux dates tombent dans la
        même période.</li>
        <li><strong>Les 400.00 de « manque à gagner » au 10.09.2025 sont passés en charge séparée.</strong>
        Sans cette écriture, l'équilibrage du 31.10.2025 passerait de ${chf(intervals[0].gap)} (produit) à ${chf(WHAT_IF.noManqueAGagner)} (charge).
        Le total de la période est identique dans les deux cas ; c'est le détail qui change.</li>
        <li><strong>Deux vidanges du 12.04.2026 ajoutées depuis le classeur</strong> (crousille 141.65, caisse St-Roch 465.00),
        absentes du relevé manuscrit qui ne portait que la caisse Chéseaux. Avec les trois, l'équilibrage du 31.03.2026
        tombe à ${chf(intervals[3].gap)} au lieu de ${chf(WHAT_IF.chzoVidangeOnly)} — c'est ce qui prouve que les trois lignes sont réelles.</li>
        <li><strong>Les sorties et rentrées de caisse sont passées en brut</strong>, une charge le matin et un produit
        le soir, et non en net. Le journal montre ainsi le fonds de caisse réellement sorti du coffre chaque jour.</li>
        <li><strong>Pas de centre de charge pour la Semaine du Vin Chaud</strong> — il n'en existe pas dans l'édition.
        Les lignes MDN portent <code>MDN</code>, les équilibrages <code>INTERNE</code> (comme la correction existante,
        séquence 52). Créer un centre <code>SVC</code> reste possible avant l'import.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head"><h2>Lignes écartées</h2><span class="hint">présentes dans les sources, volontairement non passées</span></div>
    <div class="panel-body"><ul>
      ${REJECTED().map((r) => `<li><strong>${esc(r.what)}</strong><br>${esc(r.why)}</li>`).join("\n      ")}
      ${ALREADY_BOOKED.map((r) => `<li><strong>${esc(r.note)}</strong><br>Déjà passé : ${esc(r.entry)}. Non redoublé.</li>`).join("\n      ")}
    </ul></div>
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head"><h2>Ce que l'import fera</h2></div>
    <div class="panel-body">
      <p><code>final-result.csv</code> contient les ${NEW_ENTRIES.length} écritures à créer, séquences
      <code>615</code> à <code>${sequenceNumber - 1}</code> (le maximum actuel de l'édition 2025-2026 est 614).
      Rien n'est modifié ni supprimé : les ${existing.length} écritures existantes du coffre et les
      391 écritures du compte courant restent telles quelles.</p>
      <p>Le journal de l'application trie par numéro de séquence, pas par date — le bloc importé apparaîtra
      donc à la fin de la liste, même si ses dates remontent à septembre 2025. Le tri chronologique de cette
      page est celui du compte, pas celui de l'écran.</p>
      <p>Le solde d'ouverture de 1'995.65 reste porté par <code>MoneyAccount.openingBalance</code> et n'est
      pas une écriture.</p>
    </div>
  </div>
</section>
</div>
`;

writeFileSync(join(HERE, "final-result.html"), html, "utf8");

/* ---------------------------------------------------------------- report */

console.log(`Opening ${chf(opening.cents)} at ${opening.date}`);
for (const { from, to, moved, replayed, gap, entry } of intervals) {
  console.log(
    `  ${from.date} -> ${to.date}: moved ${chf(moved)}, replayed ${chf(replayed)}, ` +
      `counted ${chf(to.cents)}, gap ${chf(gap)}` +
      (entry ? ` -> ${entry.sign > 0 ? "PRODUITS" : "CHARGES"} ${chf(entry.cents)} on ${entry.date}` : " -> none"),
  );
}
console.log(`Final ${chf(running)} (counted ${chf(finalCount.cents)})`);
console.log(`${existing.length} existing + ${NEW_ENTRIES.length} new (seq 615..${sequenceNumber - 1})`);
if (negative.length) {
  console.log(`WARNING: balance negative on ${negative.length} row(s), min ${chf(Math.min(...negative.map((r) => r.balance)))}`);
}
if (problems.length) {
  for (const p of problems) console.error(`FAIL: ${p}`);
  process.exitCode = 1;
} else {
  console.log("OK: every count reconciles exactly.");
}
