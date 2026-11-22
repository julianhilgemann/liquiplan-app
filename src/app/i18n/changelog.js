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
    { version: '1.3', date: '2026-11-22', title: { de: 'Handbuch und Leiter als Tabelle', en: 'Handbook and the ladder as a spreadsheet' }, items: [
      { kind: 'new', de: 'Handbuch: erklärt Liquiplan von den ersten Schritten bis zur Theorie, mit Kapitelmenü, Suche, häufigen Fragen und Glossar. Es öffnet sich über „Handbuch“ in der Kopfleiste oder über einen Link (#handbuch).', en: 'Handbook: explains Liquiplan from the first steps to the theory, with a chapter menu, search, frequently asked questions and a glossary. It opens from “Handbook” in the toolbar or from a link (#handbuch).' },
      { kind: 'new', de: 'Was ist neu: diese Liste der Änderungen in der App, dazu die Versionsnummer am Fuß der Seite.', en: 'What’s new: this list of changes inside the app, and the version number at the foot of the page.' },
      { kind: 'new', de: 'Die Festgeld-Leiter lässt sich als Tabelle herunterladen: je Tranche Anfangsbestand, Zins, Bewegungen und Endbestand Monat für Monat, mit Summen, für Excel und Google Sheets.', en: 'The deposit ladder can be downloaded as a spreadsheet: per tranche the opening balance, rate, movements and closing balance month by month, with totals, for Excel and Google Sheets.' },
      { kind: 'improved', de: 'Glossar: mehr Begriffe erklärt. Die unterstrichenen Begriffe und das Handbuch nutzen dasselbe Glossar.', en: 'Glossary: more terms explained. The underlined terms and the handbook share one glossary.' }
    ] },
    { version: '1.2', date: '2026-11-21', title: { de: 'Rechenweg', en: 'Step by step' }, items: [
      { kind: 'new', de: 'Rechenweg: eine eigene Seite zeigt die Entscheidungen des Optimierers für den Plan auf dem Bildschirm, eine nach der anderen. Zu jedem Schritt die Frage und die Antwort, die bisher geprüften Monate, der Plan als Monatsendstände oder der Suchverlauf, Kennzahlen und das Rechenmodell unter der Haube.', en: 'Step by step: a page of its own shows the decisions the optimiser took for the plan on screen, one at a time. For each step the question and the answer, the months checked so far, the plan as month-end balances or the progress of the search, key figures and the model under the hood.' },
      { kind: 'new', de: 'Drei Wege hinein: „Rechenweg“ in der Kopfleiste, „Rechenweg ansehen“ in der Kachel „Liquidität gesichert bis“ und die Schaltfläche im Abschnitt „Methodik“. Ohne aktuelles Ergebnis wird zuerst optimiert.', en: 'Three ways in: “Step by step” in the toolbar, “See how this was found” in the “Liquidity secured until” tile and the button in the “Methodology” section. Without a current result the app optimises first.' }
    ] },
    { version: '1.1', date: '2026-11-19', title: { de: 'Gleicher Plan auf jedem Gerät', en: 'The same plan on every device' }, items: [
      { kind: 'fixed', de: 'Gleiche Eingaben ergeben auf jedem Gerät denselben Plan. Bisher konnte ein langsames Gerät einen kürzeren Plan liefern; jetzt braucht es nur länger.', en: 'The same inputs give the same plan on every device. A slow device could find a shorter plan before; now it only takes longer.' },
      { kind: 'fixed', de: 'Zahlenfelder nehmen Komma und Punkt als Dezimalzeichen an, egal welche Sprache der Browser hat. Text, der keine Zahl ist, wird markiert und nicht mehr als 0 gespeichert.', en: 'Number fields accept a decimal comma or a decimal point, whatever language the browser is set to. Text that is not a number is flagged and no longer stored as 0.' },
      { kind: 'improved', de: 'Die Kachel „Liquidität gesichert bis“ sagt, wenn im Suchbudget kein ganzzahliger Plan gefunden wurde und wenn der Ersatz-Solver gerechnet hat.', en: 'The “Liquidity secured until” tile says when no integer plan was found within the search budget and when the fallback solver did the work.' }
    ] },
    { version: '1.0', date: '2026-11-14', title: { de: 'Erste Version', en: 'First release' }, items: [
      { kind: 'new', de: 'Optimierer für die Festgeld-Leiter: zuerst möglichst viele gedeckte Monate (T*), dann möglichst viel Vermögen, dann kürzere Laufzeiten. Ein unabhängiger Simulator prüft jeden Plan.', en: 'Optimiser for the deposit ladder: as many covered months as possible first (T*), then as much wealth as possible, then shorter terms. An independent simulator checks every plan.' },
      { kind: 'new', de: 'Ergebnisse: Kennzahlen, Verlauf, Strategievergleich, Bausteine der Leiter, Cashflow-Wasserfall, datierte Aktionsliste, Szenariovergleich, Monatsraster mit Überschreibungen, Methodik und Selbsttest.', en: 'Results: key figures, timeline, strategy comparison, ladder, cash-flow waterfall, dated action list, scenario comparison, monthly grid with overrides, methodology and self-test.' },
      { kind: 'new', de: 'Eingabe über einen Assistenten mit sechs Kapiteln oder das Eingabefeld hinter dem Zahnrad; drei Beispiele und mehrere Zinsszenarien.', en: 'Input through a six-chapter wizard or the inputs panel behind the gear button; three examples and several rate scenarios.' },
      { kind: 'new', de: 'Export und Import: HTML-Kopie mit den eigenen Eingaben, Excel-Arbeitsmappe mit Formeln, Zustand und Zinssätze als JSON.', en: 'Export and import: an HTML copy with your inputs, an Excel workbook with formulas, the state and the rates as JSON.' },
      { kind: 'improved', de: 'Die App startet ohne Daten und rechnet erst, wenn „Optimieren“ gedrückt wird. Nach einer Änderung bleiben die alten Ergebnisse ausgegraut stehen.', en: 'The app starts without data and only calculates when “Optimise” is pressed. After a change the old results stay on screen, greyed out.' },
      { kind: 'improved', de: 'Deutsch und Englisch, helles und dunkles Design, eigenes Layout für Telefone.', en: 'German and English, light and dark appearance, a layout of its own for phones.' }
    ] }
  ];
})(typeof self !== 'undefined' ? self : globalThis);
