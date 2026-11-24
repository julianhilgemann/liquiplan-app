# Changelog

<!-- This file is written by `node scripts/changelog.mjs` from src/app/i18n/changelog.js: edit that file, not these lines. -->

What changed in Liquiplan for the people who use it, newest release first. The app shows the same list, in German and in English, in its handbook under *What's new*.

Version numbers are MAJOR.MINOR, with a third number for a release that only fixes things. MINOR goes up with every release that adds or changes something users see, MAJOR only when saved inputs or exported JSON stop working with the new version.

## 1.5 · Few deposits and a search without a time limit

*24 November 2026*

- **New:** Limit on new deposits: under Inputs → “Optimisation and baseline” the number of new deposits can be limited to any whole number. The optimiser then looks for the plan with at most that many deposits that lasts longest, and the “Liquidity secured until” tile names what the simplicity costs. Pinned tranches count. In example G four deposits instead of 23 reach the same last month.
- **New:** Search on without a time limit: if wanted, the optimiser keeps searching after the usual plan, in rounds with ever larger budgets, until no better plan is possible. The dialog shows the round, the search nodes and the best plan so far; “Stop and keep this plan” ends the search and keeps it.
- **Improved:** Step by step, the self-test, the methodology and the handbook know both settings. The inputs group “Solver and baseline” is now called “Optimisation and baseline”.

## 1.4.2 · Handbook: gap above the search closed

*24 November 2026*

- **Fixed:** Handbook: a hairline gap remained between the title and the search, and the chapter’s text showed through it while scrolling. The title and the search now meet without a gap.

## 1.4.1 · Interest: what the figure includes

*22 November 2026*

- **Improved:** Tile “Interest until T\*”: below the total it now says how much of it comes from deposits. The rest is interest on overnight money.
- **Improved:** Ladder spreadsheet: a line at the top says that the workbook holds fixed-term deposits only and leaves out the interest on overnight money. The list of tranches therefore starts one row lower.

## 1.4 · The ladder spreadsheet styled as a financial model

*22 November 2026*

- **Improved:** Ladder spreadsheet: styled like a classic financial model. Dark blue bands for titles and column heads, blue bars for the sections, light blue for the first row of each tranche and the total, pale yellow for the inputs. Lines stand above subtotals and totals, and dividers beside the “Total” column. In the monthly schedule T\* is now marked amber, a maturity after the end of the plan light orange. Values and formulas are unchanged.
- **Fixed:** Handbook: on a laptop or tablet the title and the search stay in place while scrolling instead of sliding up.

## 1.3 · Handbook and the ladder as a spreadsheet

*22 November 2026*

- **New:** Handbook: explains Liquiplan from the first steps to the theory, with a chapter menu, search, frequently asked questions and a glossary. The theory chapters show the model in formulas and a chart in which the simplex method walks from corner to corner to the optimum. It opens from “Handbook” in the toolbar or from a link (#handbuch).
- **New:** What’s new: this list of changes inside the app, and the version number at the foot of the page.
- **New:** Download in “Building blocks of the deposit ladder”: the ladder as a spreadsheet for Excel and Google Sheets. A list of all deposits, and every tranche month by month and per calendar year with opening balance, placement, capitalised interest, repayment and closing balance, with totals, the view of the liquid accounts and check rows. The self-test checks the spreadsheet against the simulation.
- **Improved:** Glossary: more terms explained. The underlined terms and the handbook share one glossary.
- **Fixed:** Underlined terms now show their explanation when tapped on a phone or tablet as well.
- **Fixed:** On narrow phones the page is no longer wider than the screen in Safari.

## 1.2 · Step by step

*21 November 2026*

- **New:** Step by step: a page of its own shows the optimiser’s decisions one at a time, with question, answer, the plan at that point and the model behind it. Reached from the toolbar, the “Liquidity secured until” tile and the “Methodology” section.

## 1.1 · The same plan on every device

*19 November 2026*

- **Fixed:** The same inputs give the same plan on every device; a slow device only takes longer.
- **Fixed:** Number fields accept a decimal comma or point, whatever language the browser is set to. Text that is not a number is flagged instead of being stored as 0.
- **Improved:** The “Liquidity secured until” tile says when no integer plan was found within the search budget or the fallback solver did the work.

## 1.0 · First release

*14 November 2026*

- **New:** Optimiser for the deposit ladder: as many covered months as possible first, then as much wealth, then shorter terms; an independent simulator checks every plan.
- **New:** Results from the key figures to the monthly grid, a six-chapter wizard, three examples, rate scenarios, export as HTML, Excel and JSON, German and English, light and dark appearance.
- **Improved:** The app starts without data and only calculates when “Optimise” is pressed.
