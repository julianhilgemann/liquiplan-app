# Liquiplan: a deposit ladder planner

**Liquiditätsplaner – Festgeld-Leiter mit Überlebenshorizont** (German UI by default, English at the click of a button)

A single-file web app that answers one question: **how long will my money safely last, and which fixed-term deposits should I buy, and when, to make it last as long as possible?**

**[▶ Open the app](https://julianhilgemann.github.io/liquiplan-app/)** · nothing to install, no account, everything runs in your browser.

![Overview: KPIs, input panel and the liquidity chart](docs/screenshots/overview.png)

> **Not financial advice.** Liquiplan is a hobby project. Its results are model calculations with simplified assumptions and illustrative rates. Read the [disclaimer](#disclaimer) before relying on anything it shows.

## Contents

- [What it does](#what-it-does)
- [Using the app](#using-the-app)
- [Glossary of German terms](#glossary-of-german-terms)
- [How the optimisation works](#how-the-optimisation-works)
- [Code guide](#code-guide)
- [Function reference](#function-reference)
- [State format](#state-format)
- [Dependencies and deployment](#dependencies-and-deployment)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## What it does

You describe your situation:

- **liquid money**: a current account (*Girokonto*) and an overnight/weekly-access account (*Tagesgeld*) with its rate,
- a **monthly need** that starts on a given date and rises yearly with inflation,
- other **recurring cash flows** (rent income, pension, insurance, …) and **one-off events** (a new roof, a car, a maturing life insurance),
- fixed-term deposits you **already hold**, and
- a list of **deposit offers** (term, rate, bank, minimum and maximum amount, interest convention).

The app builds a **deposit ladder** (*Festgeld-Leiter*): a schedule of placements whose maturities arrive just in time to pay the monthly need, while everything that is not needed soon earns more than overnight money. It optimises **lexicographically**, one goal strictly after the other:

1. **Maximise the survival horizon T\***: the last month up to which every month is covered without liquidity falling below the buffer.
2. **Maximise wealth at T\*** (liquidity plus open deposits including accrued interest) without giving up a single month of T\*.
3. **Prefer shorter terms** among plans with the same wealth, which keeps money flexible.
4. **Report the shortfall** in month T\*+1, so you know how much is missing for one more month.

Interest is a secondary goal by construction: it can never shorten T\*. There is no weighted sum of goals and no greedy heuristic doing the optimising. Every plan is re-computed by an independent simulator before it is shown.

| Section | What you see |
|---|---|
| **KPIs** | T\*, runway in months, months gained against two baselines, interest until T\*, share of locked capital, the next action to take |
| **Timeline** | Month-end balances as stacked areas: current account, overnight money, deposits by term bucket, existing holdings, buffer line, shortfall zone |
| **Strategies** | Optimised plan vs. "everything in overnight money" vs. a naive rate chaser, as available liquidity or total wealth |
| **Ladder** | One bar per tranche from placement to maturity, per year or for the whole horizon; tap a bar for details |
| **Cash flow** | Waterfall per year or month: opening balance, income, need, other expenses, placements, deposit repayments, overnight interest, tax, closing balance |
| **Actions** | A dated to-do list: order deadlines, value dates, maturities, and the monthly transfer to the current account |
| **Scenarios** | The whole optimisation re-run and re-verified under each interest-rate scenario |
| **Monthly grid** | Month-by-month table. Extra need, extra income and a minimum liquidity can be overridden for single months |
| **Methodology / Self-test** | The model explained inside the app, and a button that tests solver, simulator and Excel export against each other |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/wizard.png" alt="Setup wizard"><br><sub>Six-chapter setup wizard</sub></td>
<td width="50%"><img src="docs/screenshots/ladder.png" alt="Deposit ladder as Gantt bars"><br><sub>Ladder: one bar per tranche</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/actions.png" alt="Dated action list"><br><sub>What to do, and when</sub></td>
<td><img src="docs/screenshots/strat.png" alt="Strategy comparison"><br><sub>Optimised vs. two baselines</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/waterfall.png" alt="Cash-flow waterfall"><br><sub>Cash-flow waterfall per year or month</sub></td>
<td><img src="docs/screenshots/scen.png" alt="Scenario comparison"><br><sub>Every rate scenario optimised separately</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/overview-dark.png" alt="Dark theme"><br><sub>Dark theme</sub></td>
<td align="center"><img src="docs/screenshots/mobile.png" alt="Phone layout" width="45%"><br><sub>Phone layout</sub></td>
</tr>
</table>

## Using the app

- **Online**: open the [GitHub Pages site](https://julianhilgemann.github.io/liquiplan-app/).
- **Your own copy**: download [`Liquiditaetsplaner_20261114.html`](Liquiditaetsplaner_20261114.html) and open it in a browser. There is no build step and no server. The page loads its charting, solver and Excel libraries from jsDelivr. If the solver libraries cannot load, a solver built into the page takes over.
- **First visit**: the setup wizard has six chapters, of which only the first two are required: starting liquidity and withdrawals, the economic baseline, expected central-bank rate steps, ongoing deposits, other recurring payments and new deposit offers. A chapter menu (a list on phones) jumps between them. **Analysis** in the toolbar leads to the results, where the gear button (*Inputs*) shows the same data as a side panel with a few extra settings (buffer, safety lead, denomination, tax, deposit-guarantee cap, pinned tranches).
- **Examples**: *Example G* (the reference case from the original specification), *Retirement with rental income* (20 years, pension from 2028, large one-off repairs, tax on) and *Rate trap* (example G plus a tempting 10-year deposit at 5.9 % that a naive rate chaser falls for).
- **Rate scenarios**: own central-bank steps, current rates held constant, −1 pp from 2028, rising rates (+0.5 pp a year up to +1.5 pp), inverted curve.
- **Recalculation is manual**: changing an input greys out the results until you press **Optimise**. A progress dialog then ticks off each optimisation stage; *Cancel* stops the run and keeps the previous results on screen.
- **Export / import**: HTML with your inputs embedded, an Excel workbook with live formulas, the full state as JSON, and the rate table as JSON (for quick updates of offers).

**Where your data lives.** Inputs are stored only in your browser's `localStorage`. Nothing is sent to a server; the only network requests fetch the libraries. *Download HTML* writes a copy of the app with your current inputs embedded, so treat that file like a private document.

## Glossary of German terms

The code and UI use German finance terms. The English UI translates them; here they are side by side.

| German | English | Meaning in the app |
|---|---|---|
| Girokonto | current account | 0 % interest; holds only next month's need |
| Tagesgeld | overnight money | variable rate, available daily; transfers arrive T+1 |
| Festgeld | fixed-term deposit | locked until maturity, no early withdrawal |
| Festgeld-Leiter | deposit ladder | deposits with staggered maturities |
| Überlebenshorizont T\* | survival horizon T\* | last month up to which every month is covered |
| Sockel / Puffer | buffer | minimum liquidity that is never touched |
| Sicherheitsvorlauf | safety lead | maturities count as available only 0, 1 or 3 months later |
| Stückelung | denomination | tranches are placed in whole steps of this amount (e.g. €100) |
| Mindestanlage | minimum amount | a tranche is either 0 or at least this amount |
| Zinskonvention | interest convention | *einfach* (all interest at maturity), *jährlich* (paid out yearly), *thesaurierend* (compounded yearly) |
| Abgeltungsteuer | flat-rate capital gains tax | 25 % + 5.5 % solidarity surcharge (+ church tax), settled each December |
| Sparerpauschbetrag | saver's allowance | yearly tax-free interest (€1,000 single, €2,000 joint) |
| Einlagensicherung | deposit guarantee | optional cap of open deposits per bank (statutory: €100,000) |
| Bankarbeitstag | business day | Mon–Fri without German nationwide holidays, 24 Dec and 31 Dec |
| Fixierte Tranche | pinned tranche | a placement you fix by hand; the optimiser takes it as given |
| Schlupf | slack | the amount missing at least in the first uncovered month |

## How the optimisation works

This section follows the data from your inputs to the plan on screen. Each heading names the function that does the work; the links jump to the line in the HTML file.

### 1. Inputs become a monthly timeline: [`prepare()`](Liquiditaetsplaner_20261114.html#L782)

Everything runs on a **monthly grid** `t = 0 … H−1`. Month 0 is the first month that starts on or after the start date. `prepare(state)` turns the input state into a plain problem object `P`:

- `P.need[t]`: the monthly need, starting with the first 1st of a month on or after *first withdrawal*, raised by the inflation rate in yearly steps.
- `P.inflow[t]` and `P.outflow[t]`: recurring streams (monthly, quarterly, yearly, each with its own indexation), one-off events and the per-month overrides from the monthly grid.
- `P.floor[t]`: the buffer, or a per-month minimum liquidity from the grid.
- `P.rTG[t]` and `P.products[k].rate[t]`: the overnight rate and each product's rate **for a placement made in month t**, from [`scenarioRate()`](Liquiditaetsplaner_20261114.html#L770). User-defined central-bank steps shift all rates from the first month that begins on or after the step's date.
- `P.tax.rate`: the effective flat-rate tax, `kest = 0.25 / (1 + 0.25·k)` and `rate = kest · (1 + 0.055 + k)` for a church-tax rate `k`.
- `P.products[k].minU / maxU`: minimum and maximum amount in denomination units.
- `P.existing` (holdings with their maturity month) and `P.pins` (fixed placements).

`prepare` is the only code shared between the solver and the simulator. It contains **no** payout, tax or balance logic, so the two sides can check each other.

### 2. The model: [`buildModel(P, T, opt)`](Liquiditaetsplaner_20261114.html#L1063)

For a candidate horizon `T` the app builds a mixed-integer linear programme (MILP) with these columns:

```text
u[t]   ≥ floor[t]     liquidity at month end minus maturities still inside the safety lead
n[τ,k] ∈ {0,1,2,…}    denomination units placed in product k at the start of month τ
y[τ,k] ∈ {0,1}        1 if that placement is used (only needed for minimum amounts)
q[y]   ≥ 0            taxable interest of calendar year y above the allowance
z      ≥ 0            slack of month T (only for stage 4)
```

**Balance row for every month** (`b<t>`, see [the balance rows](Liquiditaetsplaner_20261114.html#L1100)):

```text
s[t] = s[t−1]·(1 + rTG[t]/12) + net[t] + payouts[t] − placements[t] − tax[t]
```

Liquidity `s` is not a column. The model works with `u[t] = s[t] − R[t]`, where `R[t]` is the cash from maturities of the last λ months (λ = safety lead). The "never below the buffer, and don't count on money that is only just maturing" constraint then becomes a plain **lower bound** `u[t] ≥ floor[t]` instead of an extra row. The coefficients that `R` adds to later months are folded into each placement's column.

**Payouts per €1** come from [`unitFlows(conv, r, L)`](Liquiditaetsplaner_20261114.html#L1031) for a rate `r` and term `L` months (with `n` full years and `f` remaining months):

```text
simple    1 + r·L/12 at maturity
annual    r to overnight money after each full year, then 1 + r·f/12 at maturity
compound  (1 + r)^n · (1 + r·f/12) at maturity, taxed yearly on the accrued interest
```

[`unitAccrued()`](Liquiditaetsplaner_20261114.html#L1046) values a deposit that is still open at `T` (principal plus accrued interest), which matters for the wealth objective.

**Tax is linear.** For every December inside the horizon there is a row `q[y] ≥ interest[y] − allowance` and the balance row of that December pays `rate · q[y]`. `q` only has a lower bound. Paying more tax never helps any constraint or objective, so the optimum always settles at `q = max(0, interest − allowance)`. That is an exact linearisation of the kink.

**Minimum amounts are semi-integer**: a placement is either 0 or between `minU` and `maxU` units. External solvers get the classic binary formulation (`n ≥ minU·y`, `n ≤ maxU·y`). The embedded branch-and-bound handles it natively (`nativeSemi`) by branching on `n = 0` vs. `n ≥ minU`.

**The deposit-guarantee cap** (optional) limits the open principal per bank. These rows are added **lazily**: solve, check with [`capViolations()`](Liquiditaetsplaner_20261114.html#L1256), add only the violated `bank|month` rows and solve again (up to 25 rounds). Exposure can only rise in a month where a tranche starts, so only those months are ever checked.

**Options** of `buildModel` decide which candidate placements become columns:

- `allowBeyond: false` drops deposits that would mature (plus lead) after `T`. For the feasibility test this is lossless: such a deposit only takes cash out before `T`.
- `cand` restricts the columns to a candidate set proposed by an LP (see stage 2).
- `grid` thins out placement months for very large models in the embedded solver.
- `obj` selects the objective: `none` (feasibility), `wealth`, `term` or `slack`. `wealthMin` adds a lower bound on wealth (for stage 3).

### 3. Four stages: [`optimize()`](Liquiditaetsplaner_20261114.html#L1953)

```mermaid
flowchart TD
    A["Stage 1: largest feasible T<br/>LP relaxation, gallop + bisection"] --> B["Stage 2: max wealth at T*<br/>LP bound, then MILP on LP candidates"]
    B -->|integer plan found| C["Stage 3: min Σ amount·term<br/>subject to wealth ≥ optimum − tolerance"]
    B -->|no integer plan reaches T| K["Knife edge: min slack of month T<br/>MILP on widened candidate set"]
    K -->|slack ≈ 0| B
    K -->|integer infeasible| D["T := T − 1"] --> B
    C --> E["Stage 4: min shortfall in month T*+1"]
    E --> F["Plan + T* + wealth + slack"]
```

The progress dialog shows these stages live while the app optimises, followed by the independent verification and the scenario comparison:

<img src="docs/screenshots/progress.png" alt="Progress dialog listing the optimisation stages" width="720">

**Stage 1: maximise T\*** ([code](Liquiditaetsplaner_20261114.html#L1975)). Feasibility is **monotone** in `T`: if months 0…T can all be covered, so can 0…T−1. The app therefore searches for the largest feasible `T` with LP relaxations (no integrality, fast). It starts from a known-feasible month (the simulator's horizon without any new placements, `loHint`), **gallops** upwards with doubling steps until the first infeasible month, then **bisects**. That is `O(log H)` LPs.

**Stage 2: maximise wealth at T\*** ([LP bound](Liquiditaetsplaner_20261114.html#L1989), [MILP](Liquiditaetsplaner_20261114.html#L2003)). With `T` fixed, an LP maximises `s[T] + Σ open deposits incl. accrued interest`. Its value is an upper bound. The integer problem (denominations, minimum amounts) is then solved only on a **candidate set**: every (month, product) pair that the LP solutions used, plus all products in "event months" (month 0, existing maturities and the safety-lead months after them, and months with one-off income). This keeps the MILP small enough for a browser.

**Knife edge** ([code](Liquiditaetsplaner_20261114.html#L2010)). Sometimes the LP reaches `T` but no integer plan does, for example because €100 steps or a €1,000 minimum don't fit. The app then asks directly: what is the smallest slack of month `T` with integers? It solves this on a widened candidate set (±1 month around every candidate). If the slack is essentially zero it re-solves stage 2 with the new candidates. Otherwise it accepts that `T` is out of reach, sets `T := T − 1` and tries again. This is the only way T\* can end up below the LP value, and the KPI then shows the LP bound.

**Stage 3: prefer short terms** ([LP](Liquiditaetsplaner_20261114.html#L1997), [MILP](Liquiditaetsplaner_20261114.html#L2026)). Among plans whose wealth is within a tolerance of the stage-2 optimum (€0.05 or 10⁻⁶ relative, whichever is larger), minimise `Σ amount × term`. Ties are common (several ladders reach the same wealth) and the shorter ones keep more options open.

**Stage 4: report the shortfall** ([code](Liquiditaetsplaner_20261114.html#L2044)). For month `T+1` minimise the slack `z` in `u[T+1] + z ≥ floor[T+1]`. LP and MILP give the amount that is at least missing to survive one more month.

Why lexicographic and not a weighted objective? A weighted sum needs a penalty weight that trades months of safety against euros of interest, and any finite weight can be "bought off" by a high enough rate. Solving goals strictly in order makes "interest never shortens T\*" a guarantee, not a tuning result.

### 4. Solvers and how far each answer is trusted: [`Engine`](Liquiditaetsplaner_20261114.html#L1882)

The optimisation runs in a **Web Worker**, built at runtime from the page's own `src-core` and `src-solver` script text via a Blob URL ([`S.start`](Liquiditaetsplaner_20261114.html#L2612)). No separate worker file is needed, so the single HTML file works anywhere. On start the worker tries a chain of backends ([worker glue](Liquiditaetsplaner_20261114.html#L2066)):

1. **[HiGHS](https://highs.dev)** compiled to WebAssembly ([`HighsBackend`](Liquiditaetsplaner_20261114.html#L1780)). It receives the model as CPLEX LP text from [`toLPString()`](Liquiditaetsplaner_20261114.html#L1280). LPs are retried with presolve off and then with the interior-point method if the first attempt fails.
2. **javascript-lp-solver** ([`JsLpBackend`](Liquiditaetsplaner_20261114.html#L1813)), used for LPs only.
3. **The embedded solver** ([`EmbeddedBackend`](Liquiditaetsplaner_20261114.html#L1863)): a dense bounded-variable simplex plus branch-and-bound, written for this app. It is always present.

HiGHS and javascript-lp-solver must each solve a tiny test MILP correctly on load (optimum 7) before they are used. Answers are trusted only as far as they were checked:

- **Every MILP answer is "polished"** ([`polish()`](Liquiditaetsplaner_20261114.html#L1610)): the integer columns are rounded and fixed, and the continuous rest (liquidity, tax) is re-solved exactly. Results that don't survive this are discarded.
- **[`Engine.milp`](Liquiditaetsplaner_20261114.html#L1914)** always runs the embedded B&B first for a quick incumbent, then HiGHS if the embedded one did not prove optimality. The better plan wins.
- **[`Engine.lp`](Liquiditaetsplaner_20261114.html#L1893)**: an optimum from javascript-lp-solver is accepted only if the embedded simplex reaches the same objective value, and an "infeasible" from it is never trusted. After two rejected answers the backend is dropped for the session. HiGHS is restarted after a crash, at most twice, before it is dropped.
- **Watchdog**: before each call the worker posts a heartbeat with a time budget ([`S.arm`](Liquiditaetsplaner_20261114.html#L2631)). If the budget runs out, the main thread kills the worker, marks that backend as skipped (javascript-lp-solver for a week, via `localStorage`), restarts and re-sends the job. If even the embedded solver hangs, or Workers are unavailable, the embedded solver runs on the main thread ([`S.toMain`](Liquiditaetsplaner_20261114.html#L2625)).

**Inside the embedded solver** ([`Dense`](Liquiditaetsplaner_20261114.html#L1331), [`solveMILP`](Liquiditaetsplaner_20261114.html#L1635)):

- A **bounded-variable tableau simplex**: two-phase [primal](Liquiditaetsplaner_20261114.html#L1452) with artificial variables, and [dual simplex](Liquiditaetsplaner_20261114.html#L1506) re-optimisation after bound changes, so every B&B node is warm-started from its parent's basis. A periodic [`refactor()`](Liquiditaetsplaner_20261114.html#L1380) rebuilds the tableau from the original rows to remove floating-point drift.
- **Branch-and-bound** as a [depth-first search](Liquiditaetsplaner_20261114.html#L1727) with bound pruning and absolute/relative gap tolerances. A root heuristic (round everything down, fix it, re-solve) provides an early incumbent. The search cycles through three branching rules in time slices: chronological with semi-integer violations first and the down branch first (50 % of the time budget), largest value (to 75 %), most fractional with the nearest branch first (to 100 %). It stops as soon as one rule has searched the tree completely.
- **Semi-integer branching**: a column with `0 < n < min` branches into `n = 0` and `n ≥ min`, with no binary helper variable.

### 5. Independent verification: [`LP.sim.run()`](Liquiditaetsplaner_20261114.html#L2132) and [`verify()`](Liquiditaetsplaner_20261114.html#L2235)

The simulator deliberately **shares no code with the model**. It walks through the calendar, keeps the state of every tranche (principal, age, interest paid), and judges each month in this order:

1. overnight interest on last month's closing liquidity,
2. tranche events: maturities (existing holdings, new deposits by convention) and yearly anniversaries (paid out or compounded),
3. the month's inflows and outflows,
4. new placements from the plan (or from a baseline policy),
5. tax in December on the year's interest above the allowance,
6. month-end records: the current account holds next month's outflow, the rest is overnight money,
7. the month is **covered** if liquidity minus maturities still inside the safety lead is at least the floor (half-cent tolerance). T\* is the last month of the unbroken run of covered months.

`verify()` checks every placement (denomination, minimum, maximum, rate > 0, inside the horizon), checks the bank cap, and checks that the simulated T\* is at least the solver's T\*. **A plan that fails is not shown**; an error explains why.

The two **baselines** are only simulated: [`allTagesgeld()`](Liquiditaetsplaner_20261114.html#L2216) keeps everything liquid, and [`naive()`](Liquiditaetsplaner_20261114.html#L2218) buys the highest-rate product each month (if it beats overnight money) with all cash above `floor + 3 × next month's need` (the reserve multiple is adjustable).

### 6. From months to calendar dates: [`trancheDates()`](Liquiditaetsplaner_20261114.html#L3144)

The model thinks in months; the action list needs real dates. A placement for month *t* has to be **ordered by the penultimate business day of the previous month** ([`penultimateBusinessDay()`](Liquiditaetsplaner_20261114.html#L762)), is **valued on the first business day** of month *t*, and matures on the next business day after `term` months. Business days exclude weekends, German nationwide holidays ([`holidays()`](Liquiditaetsplaner_20261114.html#L745), with Easter from the anonymous Gregorian algorithm) and 24/31 December. The standing transfer of next month's need from overnight money to the current account follows the same T+1 rule. [`buildActions()`](Liquiditaetsplaner_20261114.html#L3329) turns all of this into the grouped to-do table.

### 7. Excel export: [`LP.xlsx.build()`](Liquiditaetsplaner_20261114.html#L3623)

The workbook is written with ExcelJS and post-processed with JSZip. It has nine sheets: `Cover`, `Inputs`, `CashFlows`, `Ladder`, `Liquidity`, `Gap`, `Scenarios`, `Charts`, `Solver`.

- Derived cells are **real formulas** on named input cells (the blue cells, mostly on `Inputs`), so you can change an amount or a rate in Excel and the sheets follow.
- [`mirror()`](Liquiditaetsplaner_20261114.html#L3577) recomputes every formula column in plain JS, row by row, the way Excel will. Those values are stored as cached results, so the file shows correct numbers even before Excel recalculates. A third independent implementation of the bookkeeping, compared in the self-test.
- Native **DrawingML charts** are injected into the zip.
- The `Solver` sheet comes with **pre-filled Excel Solver settings** (`solver_*` defined names) to re-run stage 2 (maximise wealth at a fixed T\*) inside Excel, with step-by-step instructions.
- [`sensitivity()`](Liquiditaetsplaner_20261114.html#L3614) re-simulates the plan under parallel rate shifts.

### 8. Self-test: [`A.selftest()`](Liquiditaetsplaner_20261114.html#L4300)

The **Self-test** button runs, for every example: the plan is verified and the simulated T\* ≥ the solver's T\*; the optimised T\* ≥ the all-overnight baseline. Then three property tests: the rate trap never ends worse than the plain case; **adding a product never shortens T\***; **adding an inflow never shortens T\***. Finally the Excel export is built, re-opened with ExcelJS, and its formula values are compared with the web simulation (≤ 1 cent per month, same first shortfall).

### Simplifications

- Current account and overnight money are pooled as one liquidity variable earning the overnight rate.
- Tax is settled once a year in December; the allowance applies per calendar year.
- The safety lead applies to all maturities, including existing holdings and reinvestments.
- Indexation happens in yearly steps from the start date or the start of a payment.
- The bank cap refers to deposit principal.
- The MILP works on an LP-proposed candidate set; the LP provides the upper bound.
- Processing days and the weekly access date from the wizard are stored but not yet modelled to the day; the safety lead in whole months stands in for them.

---

## Code guide

### One file, three script blocks

Everything lives in [`Liquiditaetsplaner_20261114.html`](Liquiditaetsplaner_20261114.html). There is no bundler; the "modules" are IIFEs that hang their API on one global namespace, `LP`.

| Block | Runs in | Contains |
|---|---|---|
| [`<script id="src-theme">`](Liquiditaetsplaner_20261114.html#L7) | main thread, before paint | applies the saved light/dark choice without a flash |
| [`<style id="css">`](Liquiditaetsplaner_20261114.html#L8) | – | all styling; colours are CSS custom properties per theme |
| [`<div id="app">`](Liquiditaetsplaner_20261114.html#L558) | – | the static page skeleton (header, wizard, input drawer, result sections, modal) |
| [`<script id="embedded-state">`](Liquiditaetsplaner_20261114.html#L711) | – | JSON: the state the file was saved with |
| [`<script id="src-core">`](Liquiditaetsplaner_20261114.html#L712) | main thread **and** worker | `core.js` (dates, calendar, timeline), `presets.js` |
| [`<script id="src-solver">`](Liquiditaetsplaner_20261114.html#L1018) | worker | `model.js`, `simplex.js`, `solve.js`, `workerglue.js` |
| [`<script id="src-app">`](Liquiditaetsplaner_20261114.html#L2123) | main thread | `sim.js`, `i18n.js`, `ui.js`, `views.js`, `xlsx.js`, `wizard.js`, `io.js` |

The split is functional: the worker is assembled from the text of `src-core` + `src-solver`, and *Download HTML* ([`A.buildHtml()`](Liquiditaetsplaner_20261114.html#L4244)) re-assembles the whole page from these blocks plus the current state.

```mermaid
flowchart LR
    subgraph main["Main thread"]
        S["A.state<br/>(inputs)"] --> R["A.run()"]
        R --> SS["A.solveState()"]
        SS --> V["LP.sim.verify()"]
        V --> RA["renderAll()"]
        V --> X["LP.xlsx.build()"]
    end
    subgraph worker["Web Worker (src-core + src-solver)"]
        PR["LP.core.prepare()"] --> OPT["LP.solve.optimize()"]
        OPT --> BM["LP.model.buildModel()"]
        BM --> EN["Engine: HiGHS → javascript-lp-solver → embedded"]
    end
    SS -- "postMessage(state)" --> PR
    OPT -- "placements, T*" --> SS
```

### Follow one run

If you want to read the code end to end, this is the order in which it executes when you press **Optimise**:

1. [`A.run()`](Liquiditaetsplaner_20261114.html#L2958): cancels older runs, shows progress, calls `solveState` for the chosen scenario, then for every other scenario in the background.
2. [`A.solveState()`](Liquiditaetsplaner_20261114.html#L2841): `prepare` on the main thread, simulates the baselines and the no-placement horizon (`loHint`), sends the job to the worker and verifies the result.
3. [`S.solve()`](Liquiditaetsplaner_20261114.html#L2662) → worker message `solve` → [`prepare()`](Liquiditaetsplaner_20261114.html#L782) → [`optimize()`](Liquiditaetsplaner_20261114.html#L1953).
4. `optimize()` calls [`buildModel()`](Liquiditaetsplaner_20261114.html#L1063) for each stage and hands it to [`Engine.lp`](Liquiditaetsplaner_20261114.html#L1893) / [`Engine.milp`](Liquiditaetsplaner_20261114.html#L1914).
5. The result returns to `solveState`, goes through [`verify()`](Liquiditaetsplaner_20261114.html#L2235), and lands in `A.view`.
6. [`renderAll()`](Liquiditaetsplaner_20261114.html#L3541) draws KPIs, charts, ladder, waterfall, actions, scenarios and grid from `A.view`.

## Function reference

### `core.js` – shared input preparation (`LP.core`)

| Function | Purpose |
|---|---|
| [`parseISO`, `iso`, `ymIdx`, `ymOf`, `addDays`, …](Liquiditaetsplaner_20261114.html#L720) | Calendar arithmetic on plain `{y, m, d}` objects, no time zones |
| [`easter`](Liquiditaetsplaner_20261114.html#L736) / [`holidays`](Liquiditaetsplaner_20261114.html#L745) | Easter date (anonymous Gregorian algorithm) and German nationwide bank holidays incl. 24/31 Dec |
| [`isBusinessDay`, `nextBusinessDay`, `prevBusinessDay`](Liquiditaetsplaner_20261114.html#L754) | Business-day logic for order, value and maturity dates |
| [`penultimateBusinessDay`](Liquiditaetsplaner_20261114.html#L762) | Order deadline for placements and the monthly transfer |
| [`scenariosFor`](Liquiditaetsplaner_20261114.html#L769) / [`scenarioRate`](Liquiditaetsplaner_20261114.html#L770) | Available rate scenarios and the rate of a product in month *t* under a scenario |
| [`prepare`](Liquiditaetsplaner_20261114.html#L782) | Input state → problem object `P` (timeline, rates, products, holdings, pins). `over` overrides horizon, scenario or a parallel rate shift |

### `presets.js` – examples and the spec JSON reader (`LP.presets`, `LP.wizardJson`)

| Function | Purpose |
|---|---|
| [`products`](Liquiditaetsplaner_20261114.html#L899) / [`base`](Liquiditaetsplaner_20261114.html#L914) | Generic product list and default state |
| [`isWizardJson`](Liquiditaetsplaner_20261114.html#L931) / [`fromWizardJson`](Liquiditaetsplaner_20261114.html#L932) | Detect and convert the `deposit-savings-planner` wizard JSON of the original specification into app state |
| [`presets`](Liquiditaetsplaner_20261114.html#L981) | The three examples: `g`, `ruhestand`, `zinsfalle` |

### `model.js` – the MILP (`LP.model`)

| Function | Purpose |
|---|---|
| [`unitFlows`](Liquiditaetsplaner_20261114.html#L1031) | Cash and taxable-interest events of €1 in a product (simple, annual, compound) |
| [`unitAccrued`](Liquiditaetsplaner_20261114.html#L1046) | Value of €1 after *e* months, for deposits still open at T |
| [`Model`](Liquiditaetsplaner_20261114.html#L1053) | Minimal sparse model container: `col()`, `row()`, `add()` |
| [`buildModel`](Liquiditaetsplaner_20261114.html#L1063) | Builds the model for horizon T: [fixed tranches](Liquiditaetsplaner_20261114.html#L1070), [balance rows](Liquiditaetsplaner_20261114.html#L1100), tax rows, [candidate placements](Liquiditaetsplaner_20261114.html#L1126), wealth objective, [bank-cap rows](Liquiditaetsplaner_20261114.html#L1200) |
| [`wealthOf`](Liquiditaetsplaner_20261114.html#L1224) / [`objOf`](Liquiditaetsplaner_20261114.html#L1229) | Evaluate wealth at T and the objective for a solution vector |
| [`checkSolution`](Liquiditaetsplaner_20261114.html#L1232) | Generic feasibility check of a vector (bounds, rows, integrality, semi-integer) |
| [`capViolations`](Liquiditaetsplaner_20261114.html#L1256) | Bank/month pairs where the cap is exceeded (for lazy rows) |
| [`placementsOf`](Liquiditaetsplaner_20261114.html#L1269) | Solution vector → list of `{t, k, amount}` |
| [`toLPString`](Liquiditaetsplaner_20261114.html#L1280) | Model → CPLEX LP format for HiGHS |

### `simplex.js` – the embedded solver (`LP.simplex`)

| Function | Purpose |
|---|---|
| [`Dense`](Liquiditaetsplaner_20261114.html#L1331) | Dense tableau with bounded variables, slacks and artificials |
| [`Dense.prototype.primal`](Liquiditaetsplaner_20261114.html#L1452) | Primal simplex (phase 1 and 2) |
| [`Dense.prototype.dual`](Liquiditaetsplaner_20261114.html#L1506) | Dual simplex for re-optimisation after bound changes |
| [`Dense.prototype.refactor`](Liquiditaetsplaner_20261114.html#L1380) | Rebuild the tableau from the original rows (removes drift) |
| [`solveLP`](Liquiditaetsplaner_20261114.html#L1601) | One LP solve |
| [`polish`](Liquiditaetsplaner_20261114.html#L1610) | Fix rounded integers, re-solve the continuous rest exactly |
| [`solveMILP`](Liquiditaetsplaner_20261114.html#L1635) | Branch-and-bound: root heuristic, [DFS](Liquiditaetsplaner_20261114.html#L1727), branching rules, gap control |

### `solve.js` – backends and the lexicographic optimisation (`LP.solve`)

| Function | Purpose |
|---|---|
| [`HighsBackend`](Liquiditaetsplaner_20261114.html#L1780) | HiGHS (WASM): self-test, LP retries, MILP with time limit and gaps |
| [`JsLpBackend`](Liquiditaetsplaner_20261114.html#L1813) | javascript-lp-solver: model conversion, LP with cross-check |
| [`EmbeddedBackend`](Liquiditaetsplaner_20261114.html#L1863) | Wraps `LP.simplex` with the same interface |
| [`Engine`](Liquiditaetsplaner_20261114.html#L1882) | Picks the backend, cross-checks, falls back, demotes unreliable backends, keeps statistics |
| [`supportKeys`](Liquiditaetsplaner_20261114.html#L1937) / [`eventMonths`](Liquiditaetsplaner_20261114.html#L1940) / [`addNeighbours`](Liquiditaetsplaner_20261114.html#L1947) | Build the MILP candidate sets from LP solutions |
| [`optimize`](Liquiditaetsplaner_20261114.html#L1953) | The four stages, knife-edge handling and lazy cap rows |

### `workerglue.js` – worker protocol

| Function | Purpose |
|---|---|
| [`init`](Liquiditaetsplaner_20261114.html#L2077) | Loads HiGHS / javascript-lp-solver from the CDN (with timeouts), builds the `Engine`, posts `ready` |
| [`solve`](Liquiditaetsplaner_20261114.html#L2107) | `prepare` → `optimize`, posts `progress`, `beat`, `result` or `error` |

### `sim.js` – independent simulator (`LP.sim`)

| Function | Purpose |
|---|---|
| [`run`](Liquiditaetsplaner_20261114.html#L2132) | Month-by-month simulation of a plan or a policy; returns balances, tranches, T\*, interest, tax, locked share |
| [`withPins`](Liquiditaetsplaner_20261114.html#L2209) | Adds pinned tranches to a plan |
| [`allTagesgeld`](Liquiditaetsplaner_20261114.html#L2216) / [`naive`](Liquiditaetsplaner_20261114.html#L2218) | The two baselines |
| [`verify`](Liquiditaetsplaner_20261114.html#L2235) | Validates a solver result against the simulation |

### `i18n.js` – texts (`LP.i18n`)

German and English UI strings, the [glossary](Liquiditaetsplaner_20261114.html#L2448) behind the dotted terms, and the [methodology text](Liquiditaetsplaner_20261114.html#L2484) shown in the app.

### `ui.js` – state, solver client, input drawer (`LP.app`, alias `A`)

| Function | Purpose |
|---|---|
| [`normalize`](Liquiditaetsplaner_20261114.html#L2536) / [`loadState`](Liquiditaetsplaner_20261114.html#L2552) | Fill defaults; load from `localStorage`, else the embedded state, else example G |
| [`A.save`](Liquiditaetsplaner_20261114.html#L2559) | Debounced save to `localStorage` |
| [`t`](Liquiditaetsplaner_20261114.html#L2563), [`A.eur`](Liquiditaetsplaner_20261114.html#L2571), [`A.monthLabel`](Liquiditaetsplaner_20261114.html#L2576), … | Translation and number/date formatting |
| [`S.start`](Liquiditaetsplaner_20261114.html#L2612), [`S.solve`](Liquiditaetsplaner_20261114.html#L2662), [`S.arm`](Liquiditaetsplaner_20261114.html#L2631), [`S.onMsg`](Liquiditaetsplaner_20261114.html#L2642) | Solver client: worker from Blob, job queue, watchdog, main-thread fallback |
| [`A.renderSide`](Liquiditaetsplaner_20261114.html#L2706) | The input drawer (basics, need and buffer, products, holdings, payments, one-offs, pins, tax and cap) |

### `views.js` – pipeline and result views

| Function | Purpose |
|---|---|
| [`A.solveState`](Liquiditaetsplaner_20261114.html#L2841) | Optimise + verify one state (used by the main run, scenarios and the self-test) |
| [`A.run`](Liquiditaetsplaner_20261114.html#L2958) / [`A.markStale`](Liquiditaetsplaner_20261114.html#L2864) | Run the pipeline; mark results as out of date after an input change |
| [`renderKpis`](Liquiditaetsplaner_20261114.html#L3033) | KPI tiles |
| [`renderMain`](Liquiditaetsplaner_20261114.html#L3095) | Liquidity and locked-capital area chart (ECharts) |
| [`renderStrat`](Liquiditaetsplaner_20261114.html#L3385) | Strategy comparison |
| [`renderLadder`](Liquiditaetsplaner_20261114.html#L3166), [`trancheDates`](Liquiditaetsplaner_20261114.html#L3144), [`trancheTotals`](Liquiditaetsplaner_20261114.html#L3155) | Ladder (Gantt) and tranche details |
| [`renderWf`](Liquiditaetsplaner_20261114.html#L3280) | Cash-flow waterfall |
| [`buildActions`](Liquiditaetsplaner_20261114.html#L3329) / [`renderActions`](Liquiditaetsplaner_20261114.html#L3346) | Dated action list |
| [`renderScen`](Liquiditaetsplaner_20261114.html#L3446) | Scenario chart and table |
| [`renderGrid`](Liquiditaetsplaner_20261114.html#L3480) / [`setOv`](Liquiditaetsplaner_20261114.html#L3507) | Monthly grid with editable overrides |

### `xlsx.js` – Excel export (`LP.xlsx`)

| Function | Purpose |
|---|---|
| [`ladderRows`](Liquiditaetsplaner_20261114.html#L3567) | Tranches → rows of the `Ladder` sheet |
| [`mirror`](Liquiditaetsplaner_20261114.html#L3577) | JS re-computation of every sheet formula (cached values + self-test) |
| [`sensitivity`](Liquiditaetsplaner_20261114.html#L3614) | Plan re-simulated under parallel rate shifts |
| [`build`](Liquiditaetsplaner_20261114.html#L3623) | Writes the nine sheets, charts and Solver names |

### `wizard.js` – six-chapter setup (`A.wizard`)

| Function | Purpose |
|---|---|
| [`W.render`](Liquiditaetsplaner_20261114.html#L4157), [`W.go`](Liquiditaetsplaner_20261114.html#L4177), [`W.show`](Liquiditaetsplaner_20261114.html#L4179), [`W.finish`](Liquiditaetsplaner_20261114.html#L4190) | Chapter navigation; edits only mark results stale, they never start a calculation |
| [`rows`](Liquiditaetsplaner_20261114.html#L4051), [`q`](Liquiditaetsplaner_20261114.html#L4047), [`yesNo`](Liquiditaetsplaner_20261114.html#L4042) | Repeating row editors, numbered questions and yes/no switches. "No" parks rows in `state.stash` instead of deleting them |

### `io.js` – files, self-test, start-up

| Function | Purpose |
|---|---|
| [`A.saveFile`](Liquiditaetsplaner_20261114.html#L4225) | Download helper |
| [`A.buildHtml`](Liquiditaetsplaner_20261114.html#L4244) | Re-assembles this HTML file with the current state embedded |
| [`A.exportXlsx`](Liquiditaetsplaner_20261114.html#L4263) | Loads ExcelJS + JSZip on demand and builds the workbook |
| [`applyState`](Liquiditaetsplaner_20261114.html#L4281) / [`applyRates`](Liquiditaetsplaner_20261114.html#L4290) | JSON import of the full state (own format or the spec format) or of the rate table |
| [`A.selftest`](Liquiditaetsplaner_20261114.html#L4300) | The self-test described above |
| [`wire`](Liquiditaetsplaner_20261114.html#L4350) / [start-up](Liquiditaetsplaner_20261114.html#L4412) | Event wiring, then render, start the worker and run the first optimisation |

## State format

The complete input is one JSON object (*Export / import → State as JSON*). The main fields:

| Field | Meaning |
|---|---|
| `startDate`, `horizon` | Start date (ISO) and planning horizon in months (≤ 360) |
| `giro`, `tg`, `tgRate` | Current account, overnight balance (€) and overnight rate (% p.a.) |
| `need`, `needIdx`, `needStart` | Monthly need (€), yearly indexation (%), first withdrawal date |
| `buffer`, `lead`, `denom` | Buffer (€), safety lead (0, 1 or 3 months), denomination (€) |
| `rateScenario`, `rateEvents[]` | Scenario id and own central-bank steps `{date, change}` in percentage points |
| `products[]` | Offers: `{id, term, rate, bank, min, max, conv: simple / annual / compound, on}` |
| `existing[]` | Holdings: `{label, bank, amount, rate, maturity}` |
| `streams[]` | Recurring payments: `{name, amount (± €), freq: m / q / y, start, end, idx}` |
| `oneoffs[]` | One-off events: `{date, amount (± €), label}` |
| `pins[]` | Pinned tranches: `{month, productId, amount}` |
| `overrides` | Monthly grid overrides keyed by `YYYY-MM`: `{extraNeed, extraIn, minLiq}` |
| `tax`, `bankCap` | `{on, church, allowance}` and `{on, cap}` |

The importer also accepts the `deposit-savings-planner` JSON from the original specification and converts it with `fromWizardJson()`.

## Dependencies and deployment

All loaded from jsDelivr with pinned versions, no build step:

| Library | Version | Used for |
|---|---|---|
| [ECharts](https://echarts.apache.org) | 5.5.1 | all charts |
| [HiGHS](https://github.com/lovasoa/highs-js) | 1.15.4 | primary LP/MILP solver (WebAssembly) |
| [javascript-lp-solver](https://github.com/JWally/jsLPSolver) | 0.4.24 | secondary LP solver |
| [ExcelJS](https://github.com/exceljs/exceljs) | 4.4.0 | Excel export (loaded on demand) |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | chart and Solver-name injection into the xlsx |

The site is published by [`.github/workflows/pages.yml`](.github/workflows/pages.yml): on every push to `main` it copies the HTML file to `index.html` and deploys it to GitHub Pages.

## License

[MIT](LICENSE). Use it, change it, share it.

## Disclaimer

**This is not financial advice.** Liquiplan is a personal project built for fun and learning. Nothing in the app, this README or the exported files is financial, investment, tax or legal advice, or a recommendation to buy any product or to use any bank.

- The results are **model calculations**. They rest on simplifications: monthly time steps, simplified German tax rules, pooled current and overnight accounts, and interest-rate scenarios that are assumptions, not forecasts.
- **All rates and bank names in the examples are illustrative.** Real offers, terms, fees, early-withdrawal rules and deposit-protection limits differ and change over time.
- The software may contain **errors**. The built-in verification checks the plan against the app's own model, not against reality.
- Check every figure with your bank and, before making financial decisions, talk to a qualified adviser.

The software is provided "as is", without warranty of any kind, as stated in the [license](LICENSE). The author accepts no liability for decisions made on the basis of it.
