/* ===== handbook/theory-de.js: German texts of the theory chapters (rendered by theory.js) =====
   Sections are [id, title, html]. In the html, $ … $ is inline TeX and $$ … $$ a display formula (never inside a <p>);
   {key} or {key|text} is a glossary term (glossary.js) with its tooltip. String.raw keeps the TeX backslashes as written. */
(function () {
  'use strict';
  var LP = window.LP; LP.hb = LP.hb || {}; LP.hb.extra = LP.hb.extra || [];
  var R = String.raw;
  var T = LP.hb.theoryText = LP.hb.theoryText || {};

  T.de = {
    mjFail: 'Die Formeln konnten nicht geladen werden (MathJax von jsDelivr). Sie stehen hier in TeX-Schreibweise.',
    eqScroll: 'Formel, seitlich verschiebbar',
    chart: {
      title: 'Spielzeugmodell: 12 oder 24 Monate?', sub: 'Beträge in Tausend Euro · Tagesgeld 1,5 %',
      aria: 'Ebene der Beträge a (12 Monate, waagrecht) und b (24 Monate, senkrecht) mit dem zulässigen Bereich, den Bedingungen 1 bis 4, der Höhenlinie des Ziels und dem Weg des Simplex. Pfeiltasten gehen Schritte vor und zurück.',
      axA: 'a · 12 Monate', axB: 'b · 24 Monate',
      back: 'Zurück', next: 'Weiter', play: 'Abspielen', pause: 'Anhalten', reset: 'Neu starten',
      cons: ['a + b ≤ 90: Heute bleibt der Sockel.', 'Monat 12: Zahlung Z, der Sockel bleibt.', 'a ≤ 60: Grenze der Bank A', 'b ≤ 60: Grenze der Bank B'], binding: 'greift',
      r12: 'Zins 12 Monate', r24: 'Zins 24 Monate', z: 'Zahlung Z in Monat 12', grid: 'Ganze Schritte zu 10.000 € zeigen',
      hint: 'Bedingung 2 lässt sich auch am runden Griff rechts im Bild ziehen. In der Grafik gehen die Pfeiltasten Schritte vor und zurück.',
      corner: 'a = {a}; b = {b}', start: 'Start', step: 'Schritt {i} von {n}', optimum: 'Optimum', gain: 'Zuwachs gegenüber Tagesgeld: {z}',
      startTxt: 'Alles bleibt auf dem Tagesgeld. Der Simplex prüft, welche Anlage je 1.000 € am meisten bringt, und erhöht sie.',
      startOpt: 'Kein Festgeld bringt hier mehr als das Tagesgeld: Schon der Start ist optimal.',
      vars: ['Das 12-Monats-Festgeld a', 'Das 24-Monats-Festgeld b'], slack: 'Der Abstand zu Bedingung {i}', up: 'steigt', down: 'sinkt', away: 'wächst',
      move: '{v} {verb} (je 1.000 € {g} mehr Zuwachs), bis {w}.', hits: 'Bedingung {i} greift', zero: ['a = 0 erreicht ist', 'b = 0 erreicht ist'],
      done: 'Keine Nachbarecke ist besser: Das ist das Optimum.',
      check: 'Gegenprobe: Alle {n} Ecken durchgerechnet, keine ist besser.', checkBad: 'Gegenprobe: Eine andere Ecke wäre besser. Das dürfte nicht vorkommen.',
      gridTxt: 'Ganze Schritte: Bester Gitterpunkt {p} mit {z}, {d} unter der LP-Schranke von {lp}.', gridSame: 'Ganze Schritte: Die beste Ecke liegt selbst auf dem Gitter ({z}).'
    },
    chapters: {
      'th-lp': { title: 'Lineare Optimierung in einem Bild', sections: [
        ['th-lp-idea', 'Was „Optimiere …“ bedeutet', R`<p>Während die App „Optimiere …“ anzeigt, löst sie eine Reihe von <strong>linearen Programmen</strong> (LP). Ein LP hat drei Teile: <em>Unbekannte</em> (wie viel in welches Festgeld, in welchem Monat), ein <em>Ziel</em>, das linear von ihnen abhängt (das Vermögen am Ende), und <em>Bedingungen</em>, die ebenfalls linear sind (in keinem Monat unter den {sockel}, keine Bank über ihrer Grenze). Linear heißt: Jede Unbekannte geht mit einem festen Faktor ein. Doppelt so viel Anlage bringt doppelt so viel Zins und bindet doppelt so viel Geld.</p>
<p>Das Modell der App hat Hunderte bis Tausende Unbekannte; der Rechenweg zeigt für jede Rechnung, wie groß sie war. Die Idee sieht man schon mit zwei. Ein Spielzeugfall: 100.000 € liegen auf dem {tg} (1,5 % im Jahr, Zinsen zum Jahresende). Zur Wahl stehen ein Festgeld über 12 Monate (Betrag $a$) und eines über 24 Monate (Betrag $b$), bei zwei Banken mit je höchstens 60.000 €. In Monat 12 ist eine Zahlung $Z$ fällig, und 10.000 € sollen immer als Sockel bleiben. Wie viel kommt in welches Festgeld?</p>`],
        ['th-lp-model', 'Das kleine Modell', R`<p>Alle Beträge in Tausend Euro, $g = 0{,}015$ ist der Tagesgeldzins. Das Ziel ist der Zuwachs $z$ an Vermögen in Monat 24 gegenüber „alles bleibt auf dem Tagesgeld“:</p>
$$\max\; z = c_{12}\,a + c_{24}\,b$$
$$c_{12} = (r_{12} - g)(1 + g)$$
$$c_{24} = (1 + 2\,r_{24}) - (1 + g)^2$$
<p>$c_{12}$ ist, was ein Euro im 12-Monats-Festgeld mehr bringt: ein Jahr den Festgeldzins statt des Tagesgeldzinses, danach liegt er wieder auf dem Tagesgeld. $c_{24}$ vergleicht zwei Jahre Festgeld mit einfachem Zins am Ende mit zwei Jahren Tagesgeld samt Zinseszins. Mit den Startwerten der Grafik (2,6 % für 12, 2,2 % für 24 Monate) bringt jeder Tausender im 24-Monats-Festgeld rund 13,8 € mehr, im 12-Monats-Festgeld rund 11,2 €. Die Bedingungen, nummeriert wie in der Grafik:</p>
<ol class="th-cons">
<li>Heute bleibt der Sockel auf dem Konto. $$a + b \le 90$$</li>
<li>In Monat 12 tragen das nicht angelegte Geld mit einem Jahr Zins und das zurückgezahlte 12-Monats-Festgeld die Zahlung, und danach ist der Sockel noch da. Das 24-Monats-Festgeld ist noch gebunden. $$\begin{aligned} &(1+g)(100 - a - b) \\ &\quad + (1 + r_{12})\,a - Z \;\ge\; 10 \end{aligned}$$</li>
<li>Grenze der Bank A: $a \le 60$.</li>
<li>Grenze der Bank B: $b \le 60$. Dazu kommen $a \ge 0$ und $b \ge 0$.</li>
</ol>
<p>Jeder Punkt $(a, b)$, der alle Bedingungen erfüllt, ist ein zulässiger Plan. Zusammen bilden sie den <em>zulässigen Bereich</em>, ein Vieleck. Punkte mit gleichem Ziel liegen auf parallelen Geraden $c_{12}\,a + c_{24}\,b = \text{const}$. Der beste Plan liegt dort, wo die höchste dieser Geraden das Vieleck gerade noch berührt: in einer Ecke, oder auf einer ganzen Kante, wenn die Gerade parallel zu ihr liegt.</p>`],
        ['th-lp-walk', 'Der Simplex, Schritt für Schritt', R`<p>Die Grafik löst das kleine Modell mit dem eingebetteten Simplex der App (<code>LP.simplex</code>), demselben Code, der im Worker die LPs löst, wenn HiGHS fehlt, und auf dem das Branch and Bound aufbaut. Der Weg ist nicht vorgezeichnet: Jede gezeigte Ecke hat dieser Code beim Lösen tatsächlich erreicht.</p>
<div class="th-chart"></div>
<p>Die blaue Fläche ist der zulässige Bereich, die Linien 1 bis 4 sind die Bedingungen; eine greifende Bedingung wird dunkel. Die gestrichelte Linie ist die Höhenlinie des Ziels durch die aktuelle Ecke, der Pfeil zeigt, wohin das Ziel wächst. Der Simplex beginnt in der Ecke $(0, 0)$, nimmt die Anlage mit dem größten Zuwachs je Tausender und erhöht sie, bis eine Bedingung greift. Dann rechnet er neu, was die übrigen Richtungen von dort bringen, und geht weiter, bis keine mehr bergauf führt.</p>
<p>Zum Ausprobieren: Den Zins für 24 Monate langsam senken. Bei knapp 2,1 % springt das Optimum von der Ecke der Bedingungen 1 und 2 zur Ecke von 1 und 3, denn ab da lohnt das kürzere Festgeld mehr. Unter gut 1,5 % bringt das 24-Monats-Festgeld weniger als das Tagesgeld und fällt ganz heraus. Bei einer kleinen Zahlung $Z$ greift Bedingung 2 an keiner Ecke mehr, eine große (über etwa 62) macht Bedingung 1 überflüssig. Der Schalter für ganze Schritte zeigt, worum es im Kapitel <a href="#handbuch/th-int">Ganze Schritte</a> geht: Der beste Gitterpunkt liegt meist neben der LP-Ecke und bringt etwas weniger.</p>`],
        ['th-lp-why', 'Warum Ecken genügen', R`<p>Der zulässige Bereich eines LP ist <em>konvex</em>: Mit zwei zulässigen Plänen ist auch jede Mischung der beiden zulässig, weil alle Bedingungen linear sind. Auf einer konvexen Menge hat ein lineares Ziel kein lokales Optimum, das nicht auch das globale wäre. Ist keine Nachbarecke besser, ist kein Punkt besser. Darauf beruht das <strong>Simplex-Verfahren</strong> (George Dantzig, 1947): von Ecke zu Ecke entlang der Kanten, jedes Mal bergauf, bis es nicht mehr bergauf geht.</p>
<p>Gerechnet wird mit Gleichungen. Jede Ungleichung bekommt eine Schlupfvariable, die misst, wie viel bis zu ihrer Grenze fehlt; aus $a + b \le 90$ wird $a + b + s_1 = 90$ mit $s_1 \ge 0$. In einer Ecke liegen so viele Variablen an einer ihrer Schranken, wie es Unbekannte gibt (die <em>Nichtbasis</em>); die übrigen (die <em>Basis</em>) folgen aus den Gleichungen. Ein Schritt (Pivot) des eingebetteten Simplex geht so:</p>
<ol>
<li><strong>Eintritt.</strong> Für jede Nichtbasisvariable $j$ sagt ihr reduzierter Kostenwert $d_j$, wie sich das Ziel je Einheit ändert, wenn sie ihre Schranke verlässt. Gewählt wird die mit der größten Verbesserung (Regel von Dantzig).</li>
<li><strong>Quotiententest.</strong> Sie wächst, bis die erste Basisvariable an eine Schranke stößt; diese verlässt die Basis. Erreicht die eintretende Variable selbst zuerst ihre obere Schranke, klappt sie nur um, ohne Basiswechsel. So behandelt das Verfahren Obergrenzen wie „höchstens 60 je Bank“ als Schranken statt als eigene Zeilen.</li>
<li><strong>Ende.</strong> Verbessert kein $d_j$ mehr, ist die Ecke optimal.</li>
</ol>
<p>Liegt der Startpunkt, alle Unbekannten an ihrer unteren Schranke, außerhalb des Bereichs, sucht eine erste Phase mit Hilfsvariablen zunächst irgendeine zulässige Ecke. Findet sie keine, ist das LP unzulässig, und genau diese Antwort braucht die <a href="#handbuch/th-lex">Suche nach T*</a>. Treffen sich in einer Ecke mehr Bedingungen als nötig, kann ein Pivot die Basis wechseln, ohne sich zu bewegen; nach zu vielen solchen Schritten nimmt der Code die erste geeignete Variable statt der besten (Regel von Bland), um nicht im Kreis zu laufen. Ein schnelles Ende verspricht die Theorie nicht, es gibt konstruierte Fälle mit sehr vielen Ecken auf dem Weg. In der Praxis genügen wenige Pivots je Zeile: Für das LP der Vermögensstufe von Beispiel G, 33 Zeilen und knapp 400 Spalten, braucht der eingebettete Simplex rund 60. HiGHS, das die LPs löst, wenn es geladen ist, arbeitet mit schnelleren Varianten desselben Gedankens.</p>`]
      ] },
      'th-model': { title: 'Die Leiter als lineares Modell', sections: [
        ['th-model-vars', 'Unbekannte auf dem Monatsraster', R`<p>Gerechnet wird auf einem Monatsraster $t = 0, \dots, T$ für einen festen Horizont $T$; welcher das ist, entscheidet das <a href="#handbuch/th-lex">nächste Kapitel</a>. Für jeden Monat $\tau$ und jedes Produkt $k$ mit positivem Zins gibt es eine Unbekannte</p>
$$\begin{gathered} n_{\tau k} \in \{0, 1, 2, \dots\} \\ \text{Anlage} = D \cdot n_{\tau k} \end{gathered}$$
<p>die Zahl der Schritte der {denom} $D$, die zu Beginn von Monat $\tau$ in Produkt $k$ gehen; der Höchstbetrag des Produkts ist ihre obere Schranke. Bestand und {pin|fixierte Tranchen} sind keine Unbekannten: Ihre Zahlungen stehen als feste Zahlen im Modell.</p>`],
        ['th-model-balance', 'Monatsbilanz und Sicherheitsvorlauf', R`<p>Die Liquidität $s_t$ (Giro und Tagesgeld zusammen) folgt Monat für Monat der Bilanz</p>
$$\begin{aligned} s_t = {} & (1 + \rho_t)\,s_{t-1} + \mathit{net}_t \\ & + A_t - D \textstyle\sum_k n_{t k} - S_t \end{aligned}$$
<p>mit $\rho_t = r^{TG}_t / 12$, dem Startguthaben als $s_{-1}$, $\mathit{net}_t$ = Zuflüsse minus Bedarf und Ausgaben, $A_t$ = Auszahlungen der Festgelder und $S_t$ = Steuer. Sicher ist ein Monat aber erst, wenn das Geld wirklich verfügbar ist. Eine Fälligkeit kann sich verspäten, deshalb zählt die Schlusszahlung eines Festgelds erst nach dem {lead} von $\lambda$ Monaten. Mit $R_t$, den Schlusszahlungen der Monate $t - \lambda + 1$ bis $t$, lautet die harte Bedingung</p>
$$u_t = s_t - R_t \;\ge\; f_t \qquad (t = 0, \dots, T).$$
<p>$f_t$ ist der {sockel} oder der Mindestwert aus dem Monatsraster. Der Code macht $u_t$ selbst zur Variablen: So wird die Bedingung zur einfachen unteren Schranke statt zu einer weiteren Zeile, und was $R_t$ in späteren Monaten bewirkt, steht als Faktor in der Spalte der jeweiligen Anlage. Jährliche Zinszahlungen zählen sofort, den Vorlauf wartet nur die Schlusszahlung ab.</p>`],
        ['th-model-pay', 'Was 1 € im Festgeld auszahlt', R`<p>Für ein Festgeld mit Jahreszins $r$ und Laufzeit $L$ Monaten, $n = \lfloor (L-1)/12 \rfloor$ vollen Jahren vor dem letzten Abschnitt und $f = L - 12n$ Monaten in diesem Abschnitt (<code>unitFlows</code>):</p>
<ul>
<li><strong>einfach:</strong> $1 + rL/12$ bei Fälligkeit;</li>
<li><strong>jährliche Auszahlung:</strong> $r$ nach jedem vollen Jahr aufs Tagesgeld, $1 + rf/12$ bei Fälligkeit;</li>
<li><strong>thesaurierend:</strong> $(1+r)^n (1 + rf/12)$ bei Fälligkeit; die jährlich zugeschlagenen Zinsen $r(1+r)^{j-1}$ werden trotzdem in ihrem Jahr versteuert.</li>
</ul>
<p>$r$ ist der Zins für eine Anlage im Monat $\tau$; in Zinsszenarien ändert er sich mit der Zeit. Weil all das nur von $r$, $L$ und $\tau$ abhängt, ist es für jede Spalte ein fester Faktor, und das Modell bleibt linear. Potenzen entstehen durch wiederholtes Multiplizieren, nicht mit <code>Math.pow</code>, damit jeder Browser dieselben Zahlen erhält. Ein Festgeld, das in $T$ noch läuft, zählt für das Vermögen mit Kapital und aufgelaufenen Zinsen (<code>unitAccrued</code>).</p>`],
        ['th-model-tax', 'Steuer, ohne die Linearität zu verlieren', R`<p>Die {abg} fällt nur auf Zinsen über dem {spb} $P$ an, also auf $\max(0, I_y - P)$ mit den Zinsen $I_y$ des Kalenderjahres $y$. Ein Maximum ist nicht linear. Das Modell führt deshalb für jedes Jahr, dessen Dezember im Raster liegt, eine Variable $q_y$ ein:</p>
$$\begin{gathered} q_y \ge I_y - P, \quad q_y \ge 0 \\ S_{\text{Dez}\,y} = \sigma\, q_y \end{gathered}$$
<p>$I_y$ ist linear: Tagesgeldzinsen $\rho_t\, s_{t-1}$ und die Zinsanteile der Auszahlungen. Mehr Steuer als nötig hilft keiner Bedingung, also bleibt jeder zulässige Plan zulässig, wenn $q_y$ auf $\max(0, I_y - P)$ sinkt, und beim Vermögensziel landet das Optimum genau dort. Die Linearisierung ist exakt. Im Satz stecken Solidaritätszuschlag und Kirchensteuer $k$: $\sigma = \frac{0{,}25}{1 + 0{,}25\,k}\,(1{,}055 + k)$. Zinsen eines Jahres, dessen Dezember nach $T$ liegt, sind für dieses $T$ noch unversteuert, im Modell wie im Simulator.</p>`],
        ['th-model-cap', 'Grenze je Bank und Mindestbeträge', R`<p>Mit der Option {esi} darf die Summe der offenen Festgelder einer Bank $b$ in keinem Monat über der Grenze $G$ liegen:</p>
$$D \sum_{(\tau, k)\ \text{offen in}\ t,\ \text{bei}\ b} n_{\tau k} \;\le\; G - F_{b t}$$
<p>$F_{bt}$ sind Bestand und fixierte Tranchen bei dieser Bank. Solche Zeilen gäbe es für jede Bank und jeden Monat; der Code fügt sie erst hinzu, wenn sie gebraucht werden: lösen, verletzte Bank-Monate suchen, nur diese Zeilen ergänzen, neu lösen, höchstens 25 Runden lang. Geprüft werden nur Monate, in denen eine Tranche beginnt, denn nur dort kann die Summe steigen. Mindestbeträge machen $n_{\tau k}$ semi-ganzzahlig: entweder 0 oder mindestens $m_k$ Schritte. Wie das gelöst wird, steht im Kapitel <a href="#handbuch/th-int">Ganze Schritte</a>.</p>`]
      ] },
      'th-lex': { title: 'Ein Ziel nach dem anderen', sections: [
        ['th-lex-order', 'Vier Ziele, streng nacheinander', R`<p>Der Planer verfolgt vier Ziele in fester Reihenfolge ({lexi|lexikographisch}):</p>
<ol>
<li>den {tstar} so spät wie möglich,</li>
<li>bei diesem $T^*$ das Vermögen in $T^*$ so groß wie möglich,</li>
<li>bei gleichem Vermögen das Geld so kurz wie möglich binden,</li>
<li>berichten, wie viel im Monat $T^*+1$ mindestens fehlt.</li>
</ol>
<p>Jede Stufe löst eigene Programme und übernimmt das Ergebnis der vorigen als feste Bedingung. Ein späteres Ziel kann ein früheres deshalb nicht verschlechtern.</p>`],
        ['th-lex-tstar', 'T* finden', R`<p>Für einen Kandidaten $T$ fragt ein LP ohne Ziel nur: Gibt es Anlagen, mit denen alle Monate $0, \dots, T$ halten? Die Antwort ist <em>monoton</em>: Reicht das Geld bis $T$, dann auch bis $T - 1$. Deshalb genügt eine Suche statt einer Prüfung jedes Monats. Sie beginnt bei dem Monat, den der Simulator ganz ohne neue Anlagen erreicht, geht mit verdoppelten Schritten nach oben, bis ein Monat nicht mehr geht, und halbiert dann das Intervall. Bei 240 Monaten sind das etwa 15 LPs. In dieser Stufe zählen nur Anlagen, die samt Vorlauf bis $T$ zurück sind: Eine längere nähme vor $T$ nur Geld weg. Gerechnet wird mit frei teilbaren Beträgen, der {lprel}. Ihr Ergebnis $T_{LP}$ ist eine obere Schranke für den Horizont mit ganzen Schritten.</p>`],
        ['th-lex-wealth', 'Vermögen, dann kurze Laufzeiten', R`<p>Mit festem $T$ maximiert die zweite Stufe das Vermögen</p>
$$W = s_T + \sum_{\text{offen in}\ T} \left(\text{Kapital} + \text{Zinsen}\right)$$
<p>mit den bis $T$ aufgelaufenen Zinsen, jetzt auch für Festgelder, die über $T$ hinaus laufen. Das LP liefert die Schranke $W_{LP}$, danach sucht das {milp} einen Plan mit ganzen Schritten (<a href="#handbuch/th-int">wie</a>). Findet es für $T$ keinen, versucht es der Optimierer mit $T - 1$, bis ein Plan da ist. Die dritte Stufe wählt unter den Plänen, deren Vermögen höchstens $\varepsilon$ unter dem besten $W^*$ liegt (5 Cent oder $10^{-6} W^*$, je nachdem, was größer ist), den mit der kürzesten Bindung:</p>
$$\begin{gathered} \min \sum_{\tau, k} D\, n_{\tau k}\, L_k \\ \text{mit}\ \ W \ge W^* - \varepsilon \end{gathered}$$
<p>Gleich gute Leitern gibt es oft, und die kürzere hält mehr Geld beweglich. Mit ganzen Schritten sucht diese Stufe nur unter den Anlagen (Monat, Produkt), die der Plan aus Stufe 2 schon nutzt, und übernimmt ihr Ergebnis nur, wenn das Vermögen die Toleranz einhält.</p>`],
        ['th-lex-slack', 'Der Monat danach', R`<p>Endet $T^*$ vor dem Planungsende, misst die vierte Stufe im Monat $T^* + 1$ den kleinsten Fehlbetrag $z$ (den {slack}):</p>
$$\begin{gathered} \min z \\ \text{mit}\ \ u_{T^*+1} + z \ge f_{T^*+1}, \quad z \ge 0 \end{gathered}$$
<p>Das LP liefert eine untere Schranke, eine ganzzahlige Suche einen Wert, den ein Plan mit ganzen Schritten erreicht; die Kachel zeigt den größeren als „Fehlbetrag im Folgemonat“. Diese Stufe ändert den Plan nicht und ist frei von den Bedingungen der Stufen 2 und 3: Sie sagt, wie viel einem beliebigen Plan für einen weiteren Monat mindestens fehlen würde.</p>`],
        ['th-lex-why', 'Warum keine gewichtete Summe', R`<p>Naheliegend wäre ein einziges Ziel, etwa mit einer Ja-/Nein-Variable $\delta_t$ für „Monat $t$ gedeckt“: $\max\ \alpha \sum_t \delta_t + W$. Dann hinge der Plan am Gewicht $\alpha$. Ist es zu klein, kauft ein hoher Zins einen Monat Sicherheit ab, ohne dass das jemand beschlossen hat. Ist es groß, rechnet der Solver mit Zahlen sehr verschiedener Größe und verliert Genauigkeit, und welches $\alpha$ genügt, hängt von den Eingaben ab. Die feste Reihenfolge braucht kein Gewicht: „Zinsen verkürzen T* nie“ ist eine Eigenschaft des Verfahrens, keine Frage der Einstellung. Der Preis sind mehrere Programme statt eines und die kleine Toleranz $\varepsilon$ zwischen den Stufen, damit Rundungsfehler der einen die nächste nicht unlösbar machen.</p>`]
      ] },
      'th-int': { title: 'Ganze Schritte und Mindestbeträge', sections: [
        ['th-int-steps', 'Warum ganze Zahlen es schwer machen', R`<p>Banken nehmen Festgeld in festen Schritten und ab einem Mindestbetrag. Im Modell heißt das: $n_{\tau k}$ ist ganzzahlig, und mit dem Mindestbetrag $m_k$ (in Schritten) gilt</p>
$$n_{\tau k} = 0 \quad \text{oder} \quad m_k \le n_{\tau k} \le M_k .$$
<p>Damit ist der zulässige Bereich keine zusammenhängende, konvexe Fläche mehr, sondern eine Menge einzelner Gitterpunkte. Das Argument „keine Nachbarecke ist besser, also optimal“ trägt nicht mehr, und Runden der LP-Lösung genügt nicht: Abgerundet fehlt Geld, aufgerundet bricht eine Bedingung, und wenn das LP 3 Schritte vorschlägt, der Mindestbetrag aber 10 verlangt, bleibt nur 0 oder 10. Aus dem LP wird ein {milp}. In der Grafik im Kapitel <a href="#handbuch/th-lp">Lineare Optimierung</a> zeigt der Schalter für ganze Schritte solche Gitterpunkte und den besten davon.</p>`],
        ['th-int-bb', 'Branch and Bound', R`<p>Gelöst wird es mit <strong>Branch and Bound</strong>, immer im eingebetteten Solver der App:</p>
<ol>
<li>Das LP ohne Ganzzahligkeit lösen. Sind alle $n$ ganz, ist dieser Zweig fertig.</li>
<li>Sonst eine Variable mit unpassendem Wert wählen, etwa $n = 3{,}4$, und in zwei Teilprobleme teilen: $n \le 3$ und $n \ge 4$. Bei einem Mindestbetrag lautet die Teilung $n = 0$ oder $n \ge m_k$, ohne Hilfsvariable.</li>
<li>Jedes Teilproblem ist wieder ein LP, sein Wert eine Schranke für alles darunter. Ist sie nicht besser als der beste Plan bisher, fällt der ganze Zweig weg.</li>
</ol>
<p>Der Baum wird zuerst in die Tiefe durchsucht; jedes Teilproblem startet mit dem dualen Simplex von der Basis seines Vorgängers. Einen ersten Plan liefert eine Heuristik: alles abrunden, festhalten, den Rest neu lösen. Die Wahl der Variablen wechselt in Abschnitten des Budgets: erst die früheste Anlage (Verstöße gegen Mindestbeträge zuerst), dann die größte, dann die am stärksten gebrochene. Jeder Plan wird „poliert“: ganzzahlige Spalten runden und festhalten, Liquidität und Steuer exakt neu rechnen; was das nicht übersteht, wird verworfen. Die Suche endet, wenn der Baum erschöpft ist oder der beste Plan höchstens 5 Cent oder $10^{-5}$ relativ unter der Schranke liegt.</p>
<p>Das MILP rechnet nicht mit allen Anlagemöglichkeiten, sondern auf einer Kandidatenmenge: alle Paare (Monat, Produkt), die die LPs der Stufen 2 und 3 nutzen, und alle Produkte in Ereignismonaten (Monat 0, Fälligkeiten des Bestands samt Vorlauf, Monate mit einmaligen Zuflüssen). Bei Beispiel G bleibt so etwa ein Fünftel der Spalten.</p>`],
        ['th-int-bound', 'Die LP-Schranke', R`<p>Das LP erlaubt mehr als das MILP, denn jeder Plan mit ganzen Schritten ist auch ein LP-Plan. Sein Optimum ist deshalb eine <strong>Schranke</strong>: Kein Plan mit ganzen Schritten reicht weiter als $T_{LP}$ oder bringt mehr Vermögen als $W_{LP}$. Die Lücke $W_{LP} - W$ sagt, wie viel ein besserer Plan höchstens brächte; der Rechenweg nennt sie.</p>
<p>In der Kachel „Liquidität gesichert bis“ steht <em>LP-Schranke: Monat</em>, wenn $T_{LP}$ später liegt als das erreichte $T^*$. Der Zusatz „ganzzahlig nicht erreicht“ heißt: Für jeden Monat dazwischen wurde gezeigt, dass es auf der jeweiligen Kandidatenmenge keinen Plan mit ganzen Schritten gibt. „Im Suchbudget kein ganzzahliger Plan gefunden“ heißt: Für mindestens einen Monat lief das Budget ab, ohne Plan und ohne Beweis; ein solcher Plan ist nicht ausgeschlossen. Ist HiGHS geladen, darf der Optimierer dann bis zu zwei direkte Ja-/Nein-Fragen je Lauf stellen. Ein Ja bringt gleich einen Plan, und der aufgegebene Monat ist zurück.</p>`],
        ['th-int-budget', 'Das Suchbudget', R`<p>Ein MILP kann sehr lange dauern; die Suche braucht ein Budget. Gemessen wird es nicht in Sekunden, sondern auf einer Arbeitsuhr, die mit jeder Rechenoperation am Tableau weiterläuft: 700.000 Operationen gelten als eine Millisekunde, etwa die Geschwindigkeit eines Laptops von 2020. Die Hauptsuche der Stufe 2 bekommt 1,2 Sekunden dieser Uhr, die Stufen 3 und 4 je 0,5. Ein schnelles Gerät ist früher fertig, kommt aber nicht weiter: Dieselben Eingaben ergeben überall denselben Plan. Endet das Budget mit einem Plan, ist es der beste gefundene, und die Lücke zur Schranke begrenzt, was noch zu holen wäre. Bei den Beispielen der App ist das der Normalfall.</p>`]
      ] },
      'th-check': { title: 'Warum man dem Ergebnis trauen kann', sections: [
        ['th-check-sim', 'Zweimal gerechnet', R`<p>Der Solver liefert nur eine Liste von Anlagen. Ob sie trägt, entscheidet ein zweites Programm, der <strong>Simulator</strong> (<code>LP.sim</code>). Mit dem Modell teilt er nur die Aufbereitung der Eingaben, keine Zeile Bilanz-, Zins- oder Steuerlogik. Er geht Monat für Monat durch den Kalender und führt jede Tranche mit Kapital und Alter: Tagesgeldzinsen, Fälligkeiten und Jahreszinsen, Zu- und Abflüsse, neue Anlagen, im Dezember die Steuer. Am Monatsende prüft er, ob die Liquidität ohne die Fälligkeiten im Vorlauf den Sockel hält, auf einen halben Cent genau.</p>
<p>Danach prüft <code>verify</code> jede Anlage: Vielfaches der Stückelung, Mindest- und Höchstbetrag, positiver Zins, innerhalb des Horizonts, Grenze je Bank, und ob der simulierte Horizont mindestens das $T^*$ des Solvers erreicht. Fällt eine Prüfung durch, erscheint statt des Plans ein Fehler. Kacheln, Diagramme und Aktionen zeigen die Zahlen des Simulators, nicht die des Solvers. Der Excel-Export rechnet die Bilanz ein drittes Mal mit Formeln nach, und der Selbsttest vergleicht die drei Rechnungen.</p>`],
        ['th-check-chain', 'Die Solver-Kette', R`<p>Gerechnet wird in einem Web Worker. Er lädt <strong>HiGHS</strong> (WebAssembly) von jsDelivr, ersatzweise <strong>javascript-lp-solver</strong>; jeder muss erst ein kleines Testprogramm richtig lösen. Der <strong>eingebettete Solver</strong> (Simplex und Branch and Bound) ist immer da. Wer welche Frage beantwortet:</p>
<ul>
<li><strong>LPs</strong> (Suche nach T*, Schranken, Kandidaten): der erste geladene Solver. Ein Optimum von javascript-lp-solver gilt erst, wenn der eingebettete Simplex denselben Zielwert findet, und sein „unzulässig“ gilt nie; nach zwei verworfenen Antworten fällt er weg.</li>
<li><strong>Ganzzahlige Programme mit Ziel:</strong> immer der eingebettete Solver. HiGHS gäbe einen Zwischenstand nur bei einem Zeitlimit heraus, und das hinge von der Geschwindigkeit des Geräts ab.</li>
<li><strong>Ja-/Nein-Fragen</strong> (gibt es überhaupt einen Plan mit ganzen Schritten?): HiGHS, mit einer Uhr, die Aufrufe zählt statt Zeit zu messen.</li>
</ul>
<p>Ein Wächter im Hauptthread beendet den Worker, wenn ein Solver hängt, lässt diesen Solver weg und startet neu; gibt es gar keinen Worker, rechnet der eingebettete Solver im Hauptthread. Meldet die Kachel „Mit dem Ersatz-Solver gerechnet“, hat HiGHS gefehlt. Der Plan ist dann genauso geprüft, kann aber anders aussehen: Hat ein LP mehrere optimale Ecken (eine ganze Kante ist optimal), wählen verschiedene Solver verschiedene, und die Ecke bestimmt die Kandidatenmenge des MILP.</p>`],
        ['th-check-repro', 'Gleiche Eingaben, gleicher Plan', R`<p>Kein Limit der Optimierung hängt an Sekunden. Der eingebettete Solver misst auf seiner Arbeitsuhr; HiGHS sieht bei Ja-/Nein-Fragen statt der Uhr einen Zähler, der bei jedem Ablesen um eins steigt; Potenzen wie $(1+r)^n$ entstehen durch Multiplizieren, weil <code>Math.pow</code> zwischen Browsern im letzten Bit abweichen kann, und das genügt, um die Suche in einen anderen Zweig zu schicken. Deshalb ergeben dieselben Eingaben mit demselben LP-Solver auf jedem Gerät denselben Plan. Echte Zeit misst nur der Wächter, und der ist großzügig, damit ein langsames Gerät nicht für hängend gehalten wird.</p>`],
        ['th-check-limits', 'Was die Prüfung nicht verspricht', R`<ul>
<li>Der Simulator zeigt, dass der Plan trägt, nicht dass er der beste ist. Bestmöglich ist er im Sinn der Stufen: auf der Kandidatenmenge und im Suchbudget. Wie weit ein besserer Plan höchstens entfernt wäre, sagen die LP-Schranken.</li>
<li>Modell und Simulator vereinfachen gleich: Giro und Tagesgeld sind ein Topf, die Steuer wird im Dezember abgerechnet, Banktage nach Fälligkeit stecken im Sicherheitsvorlauf in ganzen Monaten. Der Simulator findet Rechenfehler, keine Modellfehler.</li>
<li>Künftige Zinsen sind Annahmen. Der Szenariovergleich optimiert jede Zinsannahme für sich; die Excel-Datei rechnet den Plan zusätzlich mit verschobenen Zinsen nach.</li>
<li>Der „Fehlbetrag im Folgemonat“ ist mit frei teilbaren Beträgen eine echte Untergrenze; mit ganzen Schritten ist er der kleinste, den die Suche gefunden hat.</li>
</ul>`]
      ] }
    }
  };
})();
