# Liquiplan

A single-file web app that plans a deposit ladder (Festgeld-Leiter). German UI by default, English by toggle, everything computed in the browser. `main` deploys to https://julianhilgemann.github.io/liquiplan-app/ through GitHub Pages.

README.md is the developer documentation. Read its **Code guide** before adding or moving a source file, its **Function reference** before changing a function other files call, and its **State format** before touching saved inputs.

## Commands

```sh
node build.mjs           # src/ → dist/index.html; open that file from file://
node build.mjs --watch   # rebuild on every change in src/
node scripts/check.mjs   # build, then drive the app in a headless browser (see "Checking a change")
```

## What the code relies on

- **One file ships.** The solver worker is started from the text of the `src-core` and `src-solver` script blocks, and *HTML herunterladen* writes the style block, `A.skeleton` (the markup inside `#app`) and the three script blocks back out. So everything the page needs lives in those blocks, and a file's folder decides where it runs: `src/core/` and `src/solver/` run in the worker and stay free of DOM access.
- **Include order is load order.** A new source file takes effect through its `<!-- @include … -->` line in `src/index.html`. Every `.js` file is an IIFE on the global `LP` (`A` is `LP.app`).
- **Build guards.** `build.mjs` rejects `</script` and `<!--` in `.js` files and `</style` in `.css` files; write such text as two joined strings.
- **Libraries** load from jsDelivr at pinned versions listed in `A.CDN` (`src/app/ui/dom.js`). A new one goes there and into the README's dependency table.
- **Two languages, always.** Short UI strings are keys in `src/app/i18n/de.js` and `en.js`. A key missing in English silently shows the German text, so add both in the same edit. German is neutral (no "du"); English uses British spelling. Numbers are formatted the German way in both languages (`A.eur`, `A.pct`).
- **Tokens, both themes.** Colours come from `src/styles/tokens.css`; charts read them with `A.css('--token')` when they draw and are redrawn on a theme change.
- **Full-page views are page modes.** The wizard (`#app.wiz`), the step-by-step view (`#app.rp`) and the handbook (`#app.hb`) each put a class on `#app`, hide the workspace and trim the toolbar. A new full-page view follows that pattern.
- **Plans are deterministic.** The same inputs give the same plan on every machine. A change outside `src/core/` and `src/solver/` leaves every plan identical; a change inside them states which plans move and why.
- **Results render from `A.view`** and only after *Optimieren*. A control bound to results follows `A.view`, `A.stale` and `A.busy`.

## Three documents move with the code

A user-visible change is complete when all three agree with the app:

1. **Changelog**: an item in `src/app/i18n/changelog.js`, German and English, under the release being built. When the top entry is already live, start a new one; the version scheme is in that file's header. The app shows the top entry's version.
2. **Handbook**: the section that describes the changed behaviour, in `src/app/i18n/handbook-de.js` and `handbook-en.js` (theory chapters: `src/app/handbook/theory-de.js` and `theory-en.js`). UI labels are written as `[[key]]` so they cannot drift from the app; the markup is explained at the top of `src/app/handbook.js`.
3. **README**: the feature table, *Using the app*, the code guide and the function reference, wherever the change shows. Its links into the code carry line numbers; `scripts/check.mjs` reports the ones that no longer point at their symbol.

## Checking a change

`node scripts/check.mjs` must pass before a pull request. It needs Playwright, which is installed globally on this machine with Chromium, Firefox and WebKit. For UI work, also look at screenshots at 360, 768 and 1440 px, in light and dark, in German and English, and compare `document.documentElement.scrollWidth` with the viewport to catch sideways overflow.

This machine has no Excel and no LibreOffice. Verify a workbook by reading it back with ExcelJS and recalculating its formulas with HyperFormula in a temporary directory outside the repository, and say in the report that it was not opened in Excel or Google Sheets.

## Releasing

1. Branch from `main`. Features built in one run and tested together ship as one pull request.
2. Open the pull request with `gh pr create`, then squash-merge it.
3. The push to `main` starts the Pages workflow; wait for it with `gh run watch`.
4. Open the live site in a headless browser and repeat the feature's key steps there. The release is done when the live site shows the change.

## Tracking a run

Every run that delegates work or has more than a few steps is tracked on the user's **Agent Run Tracker**, a private artifact they read on the phone. Create the run before the first worker starts, update it after every step, and close it (`status: done`, `finishedAt`, final metrics and links) as the last action of the run. Its URL and write recipe are in the memory note `run-tracker-artifact`; on a machine without that note, find the artifact by its title with the Artifact tool's `list` action and read its "How to update this tracker" section. The tracker's text is for the user: plain sentences, no internal labels.

## Delegating

The orchestrator scopes, briefs, tracks, integrates and releases; workers execute.

- Workers run on Opus (`model: "opus"`), each in its own worktree (`isolation: "worktree"`) on its own branch, and commit there without pushing.
- A brief carries the user's own words, what done looks like, the constraints from this file, how to verify, and the report expected back.
- Where two workers' code meets, the orchestrator fixes the interface in both briefs, word for word, before either starts.
- Each worker updates its own row on the tracker; the orchestrator owns the run, the milestones and the checks.
- Workers leave README.md, CLAUDE.md and the changelog to the orchestrator and report what those need to say.
- After the merge, a separate QA worker tests the integrated build before the pull request.
