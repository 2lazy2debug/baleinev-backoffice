/**
 * Proposes a cost centre for the 2025-2026 bank entries that still have none,
 * from the event calendar. WRITES NOTHING — it emits a page to review and the
 * SQL to apply once the proposal is accepted.
 *
 *   node docs/accounting-mess/propose-cost-centres.mjs
 *     -> docs/accounting-mess/cost-centres-proposal.html
 *     -> docs/accounting-mess/cost-centres.sql        (blocks A + B, accepted rules)
 *     -> docs/accounting-mess/cost-centres-extra.sql  (block C, needs a decision)
 *
 * HOW A LINE GETS TAGGED
 * ----------------------
 * A transaction inside an event window is tagged with that event only when what
 * it is says so too: a card settlement (the stand's takings), a supermarket or
 * wholesaler run (the stand's shopping), or a label that names the event. A
 * transaction that merely happens to fall in the window — royalties, a town
 * subsidy, an invoice from a company — is association-level and is left alone,
 * because a grill week did not earn the town's 8'000 francs.
 *
 * That distinction matters most in April 2026, where the festival lands inside
 * the 13-17 April grill week: the same five days carry SUISA royalties, artist
 * fees and the town subsidy alongside the grill's TWINT takings and its Migros
 * runs.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITION = "2025-2026";

/* ---------------------------------------------------------- event calendar */

const WINDOWS = [
  { cc: "SEGRILL1", from: "2025-09-15", to: "2025-09-19", name: "Semaine grillades 1" },
  { cc: "MDN", from: "2025-11-29", to: "2025-12-07", name: "Marché de Noël" },
  { cc: "SVC", from: "2025-12-15", to: "2025-12-19", name: "Semaine du Vin Chaud" },
  { cc: "SEGRILL2", from: "2026-04-13", to: "2026-04-17", name: "Semaine grillades 2" },
  { cc: "SEGRILL3", from: "2026-06-22", to: "2026-06-30", name: "Semaine grillades 3" },
];

/* ------------------------------------------------------------------- rules */

/** Card acquirers: what a stand took on cards, settled a day or two later. */
const TAKINGS = /TWINT ACQUIRING|SUMUP PAYMENTS/i;

/** Supermarkets, wholesalers and fuel — a stand's shopping run. */
const SHOPPING =
  /\b(LANDI|MIGROS|ALIGRO|DENNER|LIDL|COOP|JUMBO|ALDI|PRODEGA|BOULANGERIE|CHOPFAB|BIERE DU BOXER|CAVE DES VITICULTEURS|SHELL|BP )/i;

/**
 * Association-level whatever the date: these never belong to an event window.
 * Subsidies, royalties, artist fees, ticketing, the bank itself, and invoices
 * from companies billing the association rather than a stand.
 */
const ASSOCIATION_LEVEL =
  /^BCV$|SUISA|COMMUNE|VILLE D'YVERDON|HEIG-VD|ASS GENERALE ETUDIANTS|WEEZEVENT|SOLDOUT|SCOP SAS|IMPACT VISION|MOBILITY|ECOMANIF|RIVELLA|Y-PARC|ENTENTE INTERCOMMUNALE|ANDRE MULLER|QUIVER|SEMONORD|BLANCHISSERIES|UNILIVE|DOUBLE R|M4S/i;

const ASSOCIATION_LABEL = /cachet|sponsoring|location refuge|NDF Artistes|foodtruck|Facture \d/i;

/** A label that names its own event outranks the window it fell in. */
const LABEL_EVENT = [
  { re: /\bMDN\b/i, cc: "MDN" },
  { re: /vin chaud/i, cc: "SVC" },
];

/**
 * The festival. Its charges and invoices land across April and May 2026 — venue,
 * ambulance, toilets, insurance, artist fees, the concession takings paid back
 * out — and its own revenue arrives through Weezevent, tickets and cashless
 * alike, on whatever date Weezevent settles.
 */
const FESTIVAL_FROM = "2026-04-01";
const FESTIVAL_TO = "2026-05-31";
const WEEZEVENT = /WEEZEVENT/i;

/**
 * The association itself on both legs — a move between our own bank account and
 * our own cash box. Never an event's cost or revenue, whatever month it lands
 * in, and already booked on the cash side.
 */
const INTERNAL_TRANSFER = /^BLV$/;

/** "SG" is séance générale, not semaine grillades: pizzas for a meeting. */
const ADMIN_LABEL = /pizzas\s+(SG|AG)\b|s[ée]ance g[ée]n[ée]rale|assembl[ée]e g[ée]n[ée]rale/i;

const isThursday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 4;
const windowFor = (date) => WINDOWS.find((w) => date >= w.from && date <= w.to) ?? null;

/* -------------------------------------------------------------- the ledger */

const rows = readFileSync(join(HERE, "journal-2025-2026-current.psv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .filter((line) => line.includes("|"))
  .map((line) => {
    const [seq, date, account, accountType, amount, counterparty, label, costCentre] = line.split("|");
    return {
      seq: Number(seq),
      date,
      account,
      accountType,
      cents: Math.round(Number(amount) * 100),
      counterparty,
      label,
      costCentre,
    };
  })
  .filter((r) => Number.isFinite(r.seq));

/* ----------------------------------------------------------- classification */

const A = []; // inside an event window, and plainly of that event
const B = []; // April ticket sales -> FESTIVAL
const C = []; // Thursday card takings outside every window -> AFTER
const D = []; // general-meeting pizzas -> INTERNE
const SKIPPED = []; // inside a window but association-level, or undecidable

for (const row of rows) {
  if (row.costCentre) continue; // already tagged, never touched
  if (row.account !== "CompteCourant") continue;

  const association = ASSOCIATION_LEVEL.test(row.counterparty) || ASSOCIATION_LABEL.test(row.label);
  const win = windowFor(row.date);

  if (ADMIN_LABEL.test(row.label)) {
    D.push({ ...row, cc: "INTERNE", why: `Séance / assemblée générale : « ${row.label} »` });
    continue;
  }

  if (WEEZEVENT.test(row.counterparty)) {
    const cashless = /CASHLESS/i.test(row.label);
    B.push({
      ...row,
      cc: "FESTIVAL",
      why:
        row.accountType === "CHARGES"
          ? "Facture Weezevent — billetterie du festival"
          : cashless
            ? "Recette Weezevent — cashless (recharges bar)"
            : "Recette Weezevent — billetterie",
    });
    continue;
  }

  const named = LABEL_EVENT.find((e) => e.re.test(row.label));
  if (named) {
    A.push({ ...row, cc: named.cc, why: `Le libellé nomme l'événement : « ${row.label} »` });
    continue;
  }

  // The stand's own trade during its week. This runs before the festival sweep
  // so the 13-17 April grill week keeps its takings and its shopping even
  // though those five days are also festival days.
  if (win && !association) {
    if (TAKINGS.test(row.counterparty)) {
      A.push({ ...row, cc: win.cc, why: `Encaissement carte pendant ${win.name}` });
      continue;
    }
    if (SHOPPING.test(row.counterparty)) {
      A.push({ ...row, cc: win.cc, why: `Achat commerce pendant ${win.name}` });
      continue;
    }
  }

  // Everything else in April and May, whether or not it also falls in the grill
  // week — SUISA and the town's subsidy are dated inside those five days and
  // belong to the festival, not to a grill evening.
  if (
    row.date >= FESTIVAL_FROM &&
    row.date <= FESTIVAL_TO &&
    !TAKINGS.test(row.counterparty) &&
    !INTERNAL_TRANSFER.test(row.counterparty)
  ) {
    B.push({ ...row, cc: "FESTIVAL", why: "Charge ou recette du festival — avril / mai 2026" });
    continue;
  }

  if (win) {
    SKIPPED.push({
      ...row,
      why: association
        ? `Dans la fenêtre ${win.name}, mais niveau association`
        : `Dans la fenêtre ${win.name}, mais ni encaissement ni achat commerce`,
    });
    continue;
  }

  if (!win && !association && TAKINGS.test(row.counterparty) && isThursday(row.date)) {
    C.push({ ...row, cc: "AFTER", why: "Encaissement carte un jeudi, hors fenêtre événement" });
    continue;
  }
}

const untouched = rows.filter(
  (r) => !r.costCentre && ![...A, ...B, ...C, ...D].some((t) => t.seq === r.seq),
).length;

/* --------------------------------------------------------------------- SQL */

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sqlFor = (list, title) => `-- ${title}
-- Generated by docs/accounting-mess/propose-cost-centres.mjs — do not hand-edit.
-- Only ever fills an EMPTY cost centre, so it cannot overwrite a decision
-- already made in the app.
\\set ON_ERROR_STOP on

${list
  .map(
    (r) => `UPDATE "JournalEntry" j SET "costCenterId" = cc.id, "updatedAt" = now()
FROM "CostCenter" cc, "Edition" ed
WHERE ed.name = ${quote(EDITION)} AND j."editionId" = ed.id
  AND cc."editionId" = ed.id AND cc.code = ${quote(r.cc)}
  AND j."sequenceNumber" = ${r.seq} AND j."costCenterId" IS NULL;`,
  )
  .join("\n\n")}

SELECT cc.code, count(j.id) AS ecritures
FROM "CostCenter" cc
LEFT JOIN "JournalEntry" j ON j."costCenterId" = cc.id
WHERE cc."editionId" = (SELECT id FROM "Edition" WHERE name = ${quote(EDITION)})
GROUP BY cc.code ORDER BY cc.code;
`;

writeFileSync(join(HERE, "cost-centres.sql"), sqlFor([...A, ...B, ...D], `${A.length + B.length + D.length} entries — event windows, the festival, and general-meeting admin`), "utf8");
writeFileSync(join(HERE, "cost-centres-extra.sql"), sqlFor(C, `${C.length} entries — Thursday card takings booked to AFTER`), "utf8");

/**
 * Clears the cost centre off exactly the sequences the two files above set, and
 * nothing else — the 16 entries that already carried one before any of this are
 * not in the list, so a rollback cannot erase a decision made by hand.
 */
const rollbackSql = `-- Clears the cost centre from the ${A.length + B.length + C.length + D.length} entries the proposal set.
-- Generated by docs/accounting-mess/propose-cost-centres.mjs — do not hand-edit.
\\set ON_ERROR_STOP on

UPDATE "JournalEntry" SET "costCenterId" = NULL, "updatedAt" = now()
WHERE "editionId" = (SELECT id FROM "Edition" WHERE name = ${quote(EDITION)})
  AND "sequenceNumber" IN (${[...A, ...B, ...C, ...D].map((r) => r.seq).sort((a, b) => a - b).join(", ")});
`;
writeFileSync(join(HERE, "cost-centres-rollback.sql"), rollbackSql, "utf8");

/* -------------------------------------------------------------------- HTML */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chf = (cents) =>
  (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fr = (iso) => iso.split("-").reverse().join(".");
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const dayName = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const net = (list) => list.reduce((s, r) => s + (r.accountType === "PRODUITS" ? r.cents : -r.cents), 0);

const table = (list, { showWhy = true } = {}) => `<div class="scroll"><table>
  <thead><tr><th class="num">Séq.</th><th>Date</th><th>Contrepartie</th><th>Libellé</th>
  <th class="num">Entrée</th><th class="num">Sortie</th>${showWhy ? "<th>CC</th><th>Règle</th>" : "<th>Raison</th>"}</tr></thead>
  <tbody>${list
    .map(
      (r) => `<tr>
      <td class="num">${r.seq}</td>
      <td class="date">${fr(r.date)}<span class="dow">${dayName(r.date).slice(0, 3)}</span></td>
      <td>${esc(r.counterparty)}</td>
      <td class="lbl">${esc(r.label) || "—"}</td>
      <td class="num in">${r.accountType === "PRODUITS" ? chf(r.cents) : ""}</td>
      <td class="num out">${r.accountType === "CHARGES" ? chf(r.cents) : ""}</td>
      ${showWhy ? `<td><span class="tag">${r.cc}</span></td>` : ""}
      <td class="src">${esc(r.why)}</td>
    </tr>`,
    )
    .join("\n")}</tbody>
</table></div>`;

const byWindow = WINDOWS.map((w) => ({
  ...w,
  rows: A.filter((r) => r.cc === w.cc),
})).filter((w) => w.rows.length);

const html = `<title>Centres de charge — proposition</title>
<style>
  :root {
    --page:#0f171f; --panel:#152330; --panel-strong:#1c2d3d; --line:#2e4256;
    --ink:#eaf1f8; --muted:#9cb0c4; --accent:#00a68c; --rose:#fda4af;
    --amber:#fcd34d; --amber-bg:rgba(120,53,15,.28); --amber-line:rgba(252,211,77,.28);
  }
  *{box-sizing:border-box}
  body{margin:0;padding:24px 20px 64px;background:var(--page);color:var(--ink);
    font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1180px;margin:0 auto}
  .eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  h1{font-size:28px;margin:4px 0 8px;letter-spacing:-.01em}
  h2{font-size:17px;margin:0}
  p{margin:0 0 10px;color:var(--muted);max-width:78ch}
  p strong,li strong{color:var(--ink)}
  section{margin-top:28px}
  .panel{border:1px solid var(--line);background:var(--panel);border-radius:10px;overflow:hidden}
  .panel-head{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:12px;
    align-items:baseline;flex-wrap:wrap}
  .panel-head .hint{font-size:11px;color:var(--muted)}
  .panel-head .net{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600}
  .panel-body{padding:16px}
  .scroll{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{padding:5px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  thead th{position:sticky;top:0;background:var(--panel-strong);color:var(--muted);font-size:10px;
    letter-spacing:.08em;text-transform:uppercase;font-weight:600;white-space:nowrap}
  tbody tr:last-child td{border-bottom:0}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .date{white-space:nowrap;font-variant-numeric:tabular-nums}
  .dow{color:var(--muted);font-size:10px;margin-left:5px}
  .in{color:var(--accent)} .out{color:var(--rose)}
  .lbl,.src{color:var(--muted);font-size:11px}
  .tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;white-space:nowrap;
    border:1px solid rgba(0,166,140,.45);color:var(--accent)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
  .card{border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:12px 14px}
  .card .k{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .card .v{font-size:21px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
  .card .n{font-size:11px;color:var(--muted);margin-top:2px}
  .warn{border:1px solid var(--amber-line);background:var(--amber-bg);border-radius:10px;
    padding:12px 14px;margin-bottom:12px}
  .warn h3{margin:0 0 6px;font-size:13px;color:var(--amber)}
  .warn p{color:var(--ink)}
  ul{margin:0;padding-left:18px;color:var(--muted)} li{margin-bottom:6px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
    background:var(--panel-strong);padding:1px 5px;border-radius:3px;color:var(--ink)}
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Baleinev · édition 2025-2026 · compte courant</div>
  <h1>Centres de charge — proposition</h1>
  <p><strong>Rien n'est écrit.</strong> Cette page propose un centre de charge pour les écritures
  bancaires qui n'en ont pas, à partir du calendrier des événements. Les 73 écritures du coffre sont
  déjà réparties et ne sont pas touchées ; une écriture qui porte déjà un centre de charge n'est
  jamais réécrite.</p>
</header>

<section>
  <div class="cards">
    <div class="card"><div class="k">Bloc A — fenêtres</div><div class="v">${A.length}</div><div class="n">écritures dans une semaine d'événement</div></div>
    <div class="card"><div class="k">Bloc B — festival</div><div class="v">${B.length}</div><div class="n">avril / mai + Weezevent → FESTIVAL</div></div>
    <div class="card"><div class="k">Bloc D — admin</div><div class="v">${D.length}</div><div class="n">pizzas de séance générale → INTERNE</div></div>
    <div class="card"><div class="k">Bloc C — jeudis</div><div class="v">${C.length}</div><div class="n">encaissements du jeudi → AFTER</div></div>
    <div class="card"><div class="k">Laissées vides</div><div class="v">${untouched}</div><div class="n">dont ${SKIPPED.length} écartées dans une fenêtre</div></div>
  </div>
</section>

<section>
  <div class="warn">
    <h3>Avril et mai vont au festival, sauf la semaine grillades</h3>
    <p>Le festival dépense en avril et en mai — cachets, SUISA, ambulance, WC, assurance, location,
    reversement des recettes aux stands — et encaisse par Weezevent, billetterie et cashless
    confondus. Toutes les écritures de ces deux mois partent donc sur <code>FESTIVAL</code>, avec
    trois exceptions : les <strong>encaissements TWINT et SumUp</strong> (le festival encaissait par
    Weezevent, pas par TWINT), les <strong>virements entre le compte et le coffre</strong> — un
    mouvement interne n'est ni une charge ni une recette — et la <strong>semaine grillades du 13 au
    17 avril</strong>, dont les recettes carte et les courses restent sur <code>SEGRILL2</code>.</p>
    <p>Ce bloc pèse ${B.length} écritures pour un résultat net de <strong>${chf(net(B))}</strong>.</p>
  </div>
</section>

${byWindow
  .map(
    (w) => `<section>
  <div class="panel">
    <div class="panel-head">
      <h2>${w.name}</h2>
      <span class="hint"><code>${w.cc}</code> · ${fr(w.from)} → ${fr(w.to)} · ${w.rows.length} écritures</span>
      <span class="net ${net(w.rows) < 0 ? "out" : "in"}">${net(w.rows) > 0 ? "+" : ""}${chf(net(w.rows))}</span>
    </div>
    ${table(w.rows)}
  </div>
</section>`,
  )
  .join("\n")}

<section>
  <div class="panel">
    <div class="panel-head">
      <h2>Bloc B — le festival</h2>
      <span class="hint"><code>FESTIVAL</code> · ${B.length} écritures · avril-mai 2026 et Weezevent</span>
      <span class="net ${net(B) < 0 ? "out" : "in"}">${net(B) > 0 ? "+" : ""}${chf(net(B))}</span>
    </div>
    ${table(B)}
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head">
      <h2>Bloc D — administratif</h2>
      <span class="hint"><code>INTERNE</code> · ${D.length} écritures</span>
      <span class="net out">${chf(net(D))}</span>
    </div>
    <div class="panel-body"><p>« SG » est une <strong>séance générale</strong>, pas une semaine
    grillades : les pizzas d'une séance ou d'une assemblée sont de l'administratif, pas un
    événement.</p></div>
    ${table(D)}
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head">
      <h2>Bloc C — encaissements du jeudi</h2>
      <span class="hint"><code>AFTER</code> · ${C.length} écritures · <strong>à confirmer séparément</strong></span>
      <span class="net in">+${chf(net(C))}</span>
    </div>
    <div class="panel-body"><p>Votre règle est « si c'est un jeudi soir, c'est l'after ». Un relevé
    bancaire ne porte pas d'heure, donc la règle est appliquée au seul type de ligne qui peut être
    la recette d'une soirée : les encaissements TWINT et SumUp datés d'un jeudi, hors de toute
    semaine d'événement. Les <em>achats</em> du jeudi ne sont pas inclus — un passage à la Landi le
    jeudi n'est pas forcément le stock du bar. Ce bloc a son propre fichier,
    <code>cost-centres-extra.sql</code>, pour que vous puissiez le refuser sans perdre le reste.</p></div>
    ${table(C)}
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head">
      <h2>Écartées alors qu'elles tombent dans une fenêtre</h2>
      <span class="hint">${SKIPPED.length} écritures · laissées sans centre de charge</span>
    </div>
    ${table(SKIPPED, { showWhy: false })}
  </div>
</section>

<section>
  <div class="panel">
    <div class="panel-head"><h2>Pour appliquer</h2></div>
    <div class="panel-body">
      <ul>
        <li><code>cost-centres.sql</code> — blocs A, B et D, ${A.length + B.length + D.length} écritures.</li>
        <li><code>cost-centres-extra.sql</code> — bloc C, ${C.length} écritures, à part.</li>
        <li>Chaque <code>UPDATE</code> est conditionné à <code>costCenterId IS NULL</code> : rejouer
        le fichier ne peut pas écraser une décision prise entre-temps dans l'application.</li>
      </ul>
    </div>
  </div>
</section>
</div>
`;

writeFileSync(join(HERE, "cost-centres-proposal.html"), html, "utf8");

console.log(`A (fenêtres)   : ${A.length}`);
for (const w of byWindow) console.log(`   ${w.cc.padEnd(9)} ${String(w.rows.length).padStart(3)}  net ${chf(net(w.rows))}`);
console.log(`B (festival)   : ${B.length}  net ${chf(net(B))}`);
console.log(`D (admin)      : ${D.length}  net ${chf(net(D))}`);
console.log(`C (jeudis)     : ${C.length}  net ${chf(net(C))}`);
console.log(`écartées       : ${SKIPPED.length}`);
console.log(`restent vides  : ${untouched}`);
