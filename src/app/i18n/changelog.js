/* ===== i18n/changelog.js: the changelog, newest release first. The single source of "Was ist neu" / "What's new"
   (the handbook chapter) and of the version number the app shows (the first entry is the current release).

   THE RULE: every user-visible change adds an item here, in German and in English, in the same commit as the change.
   Changes nobody using the app can notice (refactoring, tests, the build) get no item.

   Version numbers: MAJOR.MINOR, with a third number for a release that only fixes things (1.3.1).
   - MINOR goes up with every release that adds or changes something users see.
   - MAJOR goes up only when saved inputs or the JSON format stop working with the new version (the state format is v1).
   An entry: { version, date: 'YYYY-MM-DD', title: { de, en }, items: [{ kind: 'new' | 'improved' | 'fixed', de, en }] }.
   Plain text only; the handbook escapes it. */
(function (root) {
  'use strict';
  var LP = root.LP;

  LP.changelog = [
    { version: '1.4.2', date: '2026-11-24', title: { de: 'Handbuch: Spalt über der Suche geschlossen', en: 'Handbook: gap above the search closed' }, items: [
      { kind: 'fixed', de: 'Handbuch: Zwischen dem Titel und der Suche blieb ein haarfeiner Spalt, durch den beim Scrollen der Text des Kapitels zu sehen war. Titel und Suche schließen jetzt lückenlos aneinander an.', en: 'Handbook: a hairline gap remained between the title and the search, and the chapter’s text showed through it while scrolling. The title and the search now meet without a gap.' }
    ] },
    { version: '1.4.1', date: '2026-11-22', title: { de: 'Zinsen: was die Zahl enthält', en: 'Interest: what the figure includes' }, items: [
      { kind: 'improved', de: 'Kachel „Zinsen bis T*“: Unter der Summe steht jetzt, wie viel davon aus Festgeld stammt. Der Rest sind Zinsen auf Tagesgeld.', en: 'Tile “Interest until T*”: below the total it now says how much of it comes from deposits. The rest is interest on overnight money.' },
      { kind: 'improved', de: 'Leiter als Tabelle: Eine Zeile im Kopf sagt, dass die Mappe nur Festgelder enthält und die Zinsen auf Tagesgeld darin fehlen. Die Liste der Tranchen beginnt deshalb eine Zeile tiefer.', en: 'Ladder spreadsheet: a line at the top says that the workbook holds fixed-term deposits only and leaves out the interest on overnight money. The list of tranches therefore starts one row lower.' }
    ] },
    { version: '1.4', date: '2026-11-22', title: { de: 'Leiter-Tabelle im Stil eines Finanzmodells', en: 'The ladder spreadsheet styled as a financial model' }, items: [
      { kind: 'improved', de: 'Leiter als Tabelle: gestaltet wie ein klassisches Finanzmodell. Dunkelblaue Bänder für Titel und Spaltenköpfe, blaue Balken für die Abschnitte, hellblau die erste Zeile jeder Tranche und die Summe, hellgelb die Eingaben. Dazu Linien über Zwischensummen und Endsummen und Trennlinien neben der Spalte „Gesamt“. T* ist im Monatsplan jetzt bernsteingelb markiert, eine Fälligkeit nach Planende hellorange. Werte und Formeln sind unverändert.', en: 'Ladder spreadsheet: styled like a classic financial model. Dark blue bands for titles and column heads, blue bars for the sections, light blue for the first row of each tranche and the total, pale yellow for the inputs. Lines stand above subtotals and totals, and dividers beside the “Total” column. In the monthly schedule T* is now marked amber, a maturity after the end of the plan light orange. Values and formulas are unchanged.' },
      { kind: 'fixed', de: 'Handbuch: Titel und Suche bleiben auf Laptop und Tablet beim Scrollen an ihrem Platz, statt nach oben wegzurutschen.', en: 'Handbook: on a laptop or tablet the title and the search stay in place while scrolling instead of sliding up.' }
    ] },
    { version: '1.3', date: '2026-11-22', title: { de: 'Handbuch und Leiter als Tabelle', en: 'Handbook and the ladder as a spreadsheet' }, items: [
      { kind: 'new', de: 'Handbuch: erklärt Liquiplan von den ersten Schritten bis zur Theorie, mit Kapitelmenü, Suche, häufigen Fragen und Glossar. Die Theoriekapitel zeigen das Rechenmodell in Formeln und eine Grafik, in der das Simplex-Verfahren von Ecke zu Ecke zum Optimum läuft. Es öffnet sich über „Handbuch“ in der Kopfleiste oder über einen Link (#handbuch).', en: 'Handbook: explains Liquiplan from the first steps to the theory, with a chapter menu, search, frequently asked questions and a glossary. The theory chapters show the model in formulas and a chart in which the simplex method walks from corner to corner to the optimum. It opens from “Handbook” in the toolbar or from a link (#handbuch).' },
      { kind: 'new', de: 'Was ist neu: diese Liste der Änderungen in der App, dazu die Versionsnummer am Fuß der Seite.', en: 'What’s new: this list of changes inside the app, and the version number at the foot of the page.' },
      { kind: 'new', de: 'Download in „Bausteine der Festgeld-Leiter“: die Leiter als Tabelle für Excel und Google Sheets. Eine Liste aller Festgelder, dazu jede Tranche Monat für Monat und je Kalenderjahr mit Anfangsbestand, Anlage, Zinsgutschrift, Rückzahlung und Endbestand, mit Summen, der Sicht der liquiden Konten und Prüfzeilen. Der Selbsttest prüft die Tabelle gegen die Simulation.', en: 'Download in “Building blocks of the deposit ladder”: the ladder as a spreadsheet for Excel and Google Sheets. A list of all deposits, and every tranche month by month and per calendar year with opening balance, placement, capitalised interest, repayment and closing balance, with totals, the view of the liquid accounts and check rows. The self-test checks the spreadsheet against the simulation.' },
      { kind: 'improved', de: 'Glossar: mehr Begriffe erklärt. Die unterstrichenen Begriffe und das Handbuch nutzen dasselbe Glossar.', en: 'Glossary: more terms explained. The underlined terms and the handbook share one glossary.' },
      { kind: 'fixed', de: 'Unterstrichene Begriffe zeigen ihre Erklärung jetzt auch beim Antippen auf Handy und Tablet.', en: 'Underlined terms now show their explanation when tapped on a phone or tablet as well.' },
      { kind: 'fixed', de: 'Auf schmalen Handys ist die Seite in Safari nicht mehr breiter als der Bildschirm.', en: 'On narrow phones the page is no longer wider than the screen in Safari.' }
    ] },
    { version: '1.2', date: '2026-11-21', title: { de: 'Rechenweg', en: 'Step by step' }, items: [
      { kind: 'new', de: 'Rechenweg: eine eigene Seite zeigt die Entscheidungen des Optimierers eine nach der anderen, mit Frage, Antwort, dem Plan zu diesem Zeitpunkt und dem Rechenmodell dahinter. Erreichbar über die Kopfleiste, die Kachel „Liquidität gesichert bis“ und den Abschnitt „Methodik“.', en: 'Step by step: a page of its own shows the optimiser’s decisions one at a time, with question, answer, the plan at that point and the model behind it. Reached from the toolbar, the “Liquidity secured until” tile and the “Methodology” section.' }
    ] },
    { version: '1.1', date: '2026-11-19', title: { de: 'Gleicher Plan auf jedem Gerät', en: 'The same plan on every device' }, items: [
      { kind: 'fixed', de: 'Gleiche Eingaben ergeben auf jedem Gerät denselben Plan; ein langsames Gerät braucht nur länger.', en: 'The same inputs give the same plan on every device; a slow device only takes longer.' },
      { kind: 'fixed', de: 'Zahlenfelder nehmen Komma und Punkt als Dezimalzeichen an, egal welche Sprache der Browser hat. Text, der keine Zahl ist, wird markiert statt als 0 gespeichert.', en: 'Number fields accept a decimal comma or point, whatever language the browser is set to. Text that is not a number is flagged instead of being stored as 0.' },
      { kind: 'improved', de: 'Die Kachel „Liquidität gesichert bis“ sagt, wenn im Suchbudget kein ganzzahliger Plan gefunden wurde oder der Ersatz-Solver gerechnet hat.', en: 'The “Liquidity secured until” tile says when no integer plan was found within the search budget or the fallback solver did the work.' }
    ] },
    { version: '1.0', date: '2026-11-14', title: { de: 'Erste Version', en: 'First release' }, items: [
      { kind: 'new', de: 'Optimierer für die Festgeld-Leiter: zuerst möglichst viele gedeckte Monate, dann möglichst viel Vermögen, dann kürzere Laufzeiten; ein unabhängiger Simulator prüft jeden Plan.', en: 'Optimiser for the deposit ladder: as many covered months as possible first, then as much wealth, then shorter terms; an independent simulator checks every plan.' },
      { kind: 'new', de: 'Ergebnisse von den Kennzahlen bis zum Monatsraster, Assistent mit sechs Kapiteln, drei Beispiele, Zinsszenarien, Export als HTML, Excel und JSON, Deutsch und Englisch, helles und dunkles Design.', en: 'Results from the key figures to the monthly grid, a six-chapter wizard, three examples, rate scenarios, export as HTML, Excel and JSON, German and English, light and dark appearance.' },
      { kind: 'improved', de: 'Die App startet ohne Daten und rechnet erst, wenn „Optimieren“ gedrückt wird.', en: 'The app starts without data and only calculates when “Optimise” is pressed.' }
    ] }
  ];
})(typeof self !== 'undefined' ? self : globalThis);
