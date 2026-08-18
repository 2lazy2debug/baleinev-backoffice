# Workbook analysis summary

## What the workbook is

This workbook is a lightweight accounting and budget control system for a single festival edition.

Its structure is centered on one master ledger sheet (`JOURNAL`), one consolidated reporting sheet (`RESULTATS`), and a set of department sheets that combine:

- a manually entered budget section
- an automatically populated accounting section extracted from `JOURNAL`

## Main sheets

### JOURNAL

`JOURNAL` is the source of truth for accounting entries.

Main fields observed:

- account/category (`Compte`), for example `EVENTS / Produits`
- sequential number
- date
- amount
- counterparty (`En faveur de`)
- label (`Libellé`)
- entered by
- money location (`Coffre/Banque`)
- cost center (`Centre de coûts`)
- reference number

It also computes running balances per money container:

- `CompteCourant`
- `Coffre`
- `CompteEpargne`
- `CompteMyPos`

The running balance formulas use `DATA` to determine whether a ledger line is treated as a product or a charge.

### RESULTATS

`RESULTATS` is the management summary sheet.

It compares, for each department:

- budgeted charges
- budgeted products
- budgeted profit/loss
- actual accounting charges
- actual accounting products
- actual accounting profit/loss
- variance between actual and budget

It also contains top-level ticketing assumptions such as pre-sales, entry assumptions, and subsidized tickets.

### Department sheets

Visible department sheets include:

- `ADMINISTRATION`
- `COMMUNICATION`
- `DÉCORATION`
- `DIVERS`
- `ÉLECTRICITÉ`
- `ENTREES`
- `EVENTS`
- `INFRASTRUCTURE`
- `LOGES`
- `PROGRAMMATION`
- `PMW`
- `RAVITAILLEMENT`
- `SECURITE`
- `SPONSORING`
- `TECHNIQUE`
- `SANS EFFET`

Most follow the same template:

1. A `BUDGET` section with manual planned charges and products.
2. Totals with `SUM(...)` formulas.
3. A `COMPTABILITE` section that pulls matching ledger entries from `JOURNAL` using `VLOOKUP(...)` and `INDIRECT(...)` chains.

This means the department sheets are not independent transaction stores. They are budget/control views over the central ledger.

### DATA

`DATA` is a mapping helper sheet.

It appears to generate valid combinations such as:

- `Department / Charges`
- `Department / Produits`

It also stores cost-center codes such as `AFTER`, `SEGRILL1`, `SEGRILL2`, `GM`, `FESTIVAL`, `JACC`, and others.

This sheet is used by `JOURNAL` formulas to decide whether a transaction increases or decreases each running balance.

### Hidden/template sheets

- `Vide`
- `Vide_2`
- `Tabelle1`

`Vide` and `Vide_2` are template-like department sheets kept hidden.

### A Propos

`A Propos` documents the purpose and maintenance history of the workbook since 2012.

## Implied business model

The workbook tracks four distinct concerns:

1. Festival budget planning by department.
2. Real accounting entries in one chronological journal.
3. Cash and bank position by money container.
4. Management control through budget-versus-actual reporting.

## Implied entities for the future application

The spreadsheet strongly suggests these core entities:

- festival edition
- department
- account type (`Charges`, `Produits`, possibly `Sans effet`)
- journal entry
- money account/container
- cost center / activity
- budget line
- accounting line classification
- sponsor or counterparty
- user / entry author

## Important spreadsheet logic that will need explicit application logic

### 1. One central journal, many derived views

Department accounting tables are derived from `JOURNAL`, not entered separately. The future application should preserve that model.

### 2. Classification drives sign and balances

The formulas in `JOURNAL` use lookup logic to decide whether an amount should add to or subtract from a running balance. In the application this should become explicit typed business logic, not spreadsheet formulas.

### 3. Department tabs depend on name conventions

The extraction formulas rely on text keys such as `DEPARTMENT / Charges` and `DEPARTMENT / Produits`. The application should replace this with relational data instead of string matching.

### 4. Budget and accounting are separate datasets

Each department stores planned budget lines separately from actual ledger entries. The future platform should keep this distinction explicit.

### 5. Cost centers matter

Ledger lines carry cost-center codes like `AFTER`, `JACC`, `SEGRILL1`, and others. These likely represent operational sub-activities inside a department and should become a first-class model.

## Early product interpretation

This is not just a bookkeeping file. It is a hybrid of:

- accounting journal
- budget builder
- treasury tracker
- departmental reporting dashboard

For the Node.js replacement, the first useful product scope looks like:

1. Journal entry management.
2. Department budget management.
3. Automatic actuals aggregation by department and type.
4. Running balances by money account.
5. Summary dashboard equivalent to `RESULTATS`.

## Key risks when replacing it

1. The workbook contains a lot of logic encoded through text conventions and lookup chains rather than explicit structure.
2. The accounting sections in department sheets are effectively reports, not source data.
3. Cost centers and money containers are operationally important even though the workbook does not model them as separate entities.
4. There are hidden template sheets that suggest the model evolved organically rather than from a stable schema.