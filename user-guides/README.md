# Algo Quant — user guides

Eighteen PDFs: one guide per role, each in Arabic, English, and both languages in a single
file (Arabic first, then English). Every guide contains only what that role can actually see
and do in the system.

| Role | Arabic | English | Both | Pages (AR / EN / both) |
| --- | --- | --- | --- | --- |
| Administrator — the complete manual | `Algo-Quant-Guide-Admin-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 57 / 58 / 115 |
| Operations | `Algo-Quant-Guide-Operations-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 37 / 37 / 74 |
| Accounting | `Algo-Quant-Guide-Accounting-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 35 / 37 / 72 |
| Sales | `Algo-Quant-Guide-Sales-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 33 / 34 / 67 |
| Instructor | `Algo-Quant-Guide-Instructor-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 27 / 27 / 54 |
| Media | `Algo-Quant-Guide-Media-AR.pdf` | `-EN.pdf` | `-Bilingual.pdf` | 20 / 21 / 41 |

The administrator guide is the complete manual: it covers every chapter, including settings,
the activity log and document numbering, so it doubles as the reference copy for the academy.

Each guide has a cover, a table of contents, numbered chapters, screenshots taken from the
running system, step-by-step procedures, state tables showing which transitions are allowed,
a permissions matrix and a list of common questions.

## Which guide to hand to whom

Give each member of staff the guide for the privilege they hold. Someone holding more than one
privilege (for example operations **and** accounting) should get both guides, or the
administrator manual, which contains everything.

## Keeping them up to date

These are generated, not hand-written. The source is in `.local/guide/`: edit the content
modules, then run `node build.mjs` followed by `node printall.mjs pdf`, and copy the results
here. Regenerate whenever the system changes so the screenshots and the rules stay true.

Version 1.0 · 26 September 2026. The screenshots use demonstration data; the names and figures
staff will see are the academy's own.
