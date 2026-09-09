# Reconstitution de la comptabilité 2025-2026

Le compte bancaire venait du relevé BCV et était juste. Le coffre ne l'était pas :
23 écritures pour toute l'année, et le reste éparpillé dans trois classeurs et une
note manuscrite. Ce dossier reconstitue le coffre, le rapproche des comptages
physiques, puis répartit l'année par centre de charge.

Tout a été appliqué en production le 09.09.2026.

## État final

| Édition | Compte | Solde | Écritures |
|---|---|---:|---:|
| 2025-2026 | Coffre | **937.80** | 73 |
| 2025-2026 | CompteCourant | 813.47 | 391 |
| 2026-2027 | Coffre | 937.80 | 1 (report) |
| 2026-2027 | CompteCourant | 813.47 | 1 (report) |

| Centre | Écritures | Net |
|---|---:|---:|
| FESTIVAL | 79 | +6'503.98 |
| MDN | 35 | +4'479.19 |
| SVC | 33 | +4'004.50 |
| SEGRILL2 | 24 | +2'674.36 |
| AFTER | 28 | +1'950.50 |
| SEGRILL1 | 15 | +737.54 |
| INTERNE | 11 | +472.43 |
| SEGRILL3 | 4 | +456.14 |
| GM · JACC · EVTCHILL | 4 | +255.70 |

| Budget | Écritures | Net |
|---|---:|---:|
| EVENTS | 221 | +21'079.56 |
| ADMINISTRATION | 17 | −1'148.49 |
| COMMUNICATION | 3 | −744.38 |
| TECHNIQUE | 2 | −9'440.32 |

Les budgets suivent les centres de charge : tout ce qui en porte un va sur EVENTS,
sauf INTERNE — corrections de caisse et pizzas de séance — qui est de
l'administration, au même titre que les frais bancaires et les locations de refuge
et de chalet. Elia Nicolo et les flyers vont sur COMMUNICATION, Impact Vision sur
TECHNIQUE, et ces deux règles passent avant celle des événements : le remboursement
de mai d'Elia Nicolo porte le centre FESTIVAL et reste de la communication.

231 écritures restent sans centre de charge : l'année ordinaire de l'association,
qui n'appartient à aucun événement, plus les 7 virements entre le compte et le
coffre — un mouvement interne n'est ni une charge ni une recette.

## Les scripts

Chaque chiffre publié est calculé par un script, y compris les comparaisons
« sinon ce serait X » : la prose ne peut pas diverger de l'arithmétique.

| Script | Produit |
|---|---|
| `build-coffre-reconciliation.mjs` | `final-result.html` (page de revue) et `final-result.csv` (les 50 écritures) |
| `emit-production-sql.mjs` | `apply.sql` et `rollback.sql` — écrit le coffre, recalcule le report 2026-2027 |
| `propose-cost-centres.mjs` | `cost-centres-proposal.html`, `cost-centres.sql`, `cost-centres-extra.sql`, `cost-centres-rollback.sql` |
| `assign-budgets.mjs` | `budgets.sql` et `budgets-rollback.sql` — le budget déduit du centre de charge |

`apply.sql` est rejouable : chaque id est dérivé du numéro de séquence et les
insertions sont `ON CONFLICT DO NOTHING`. Les fichiers de centres de charge ne
remplissent qu'un centre **vide**, donc ils n'écrasent jamais une décision prise
à la main dans l'application. Les trois passes ont été répétées sur une
restauration de la sauvegarde de production avant d'être jouées pour de vrai.

## Ce qui a été décidé, et pourquoi

- **Les écarts contre un comptage** deviennent une écriture « Équilibrage après
  comptage du coffre », datée d'une fin de mois **à l'intérieur** de la période,
  pour que le solde compté reste exact le jour où il a été compté. Six écritures,
  de −468.90 à +1'755.95.
- **Le cinquième jour St-Roch est daté du 19.12.2025**, pas du 15.12 comme le dit
  la note : son fonds de caisse (393.60) est le comptage de clôture du 18.12, et
  la colonne du classeur porte le sérial Excel 46010.
- **Deux vidanges du 12.04.2026** ont été reprises du classeur alors qu'elles
  manquaient à la note. Avec elles, l'équilibrage du 31.03 tombe de 605.45 à
  −1.20 — c'est ce qui prouve qu'elles sont réelles.
- **« SG » est une séance générale**, pas une semaine grillades : les pizzas d'une
  séance ou d'une AG sont de l'administratif.
- **Le festival est avril + mai**, pas une fenêtre de cinq jours : ses charges
  s'étalent sur deux mois et ses recettes arrivent par Weezevent. Trois
  exceptions : les encaissements carte, les virements internes, et la semaine
  grillades du 13 au 17 avril, qui garde ses recettes et ses courses.

## Le point qui reste ouvert

Le coffre est **négatif du 21.05 au 31.05.2026**, jusqu'à −1'270.35. Les
10'260.35 versés à la banque le 21.05 dépassent les 8'990 comptés le 05.05 :
la recette cash du festival est entrée au coffre entre ces deux dates, mais
aucune source ne la date. L'équilibrage correspondant est daté du 31.05, dernière
fin de mois avant le comptage final. **Si la date du dépôt réapparaît**, remplacer
cette écriture par une entrée datée fait disparaître la période négative.
