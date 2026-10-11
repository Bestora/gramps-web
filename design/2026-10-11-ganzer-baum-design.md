# Familien-Modus: Ganzer Baum – Design

Stand: 11.10.2026 · baut auf `design/2026-10-11-familienmodus-design.md` auf

## Ziel

Im Familien-Modus lässt sich der **komplette Stammbaum mit wirklich allen
Personen** ansehen – auch angeheiratete Familien. Das ist das Bild, das man
herumzeigt („so groß ist unsere Familie, und da bin ich“).

Erfolg heißt: Auf Handy und PC sieht man alle Personen auf einer Fläche,
findet sich selbst sofort (hervorgehoben, „Zu mir“ springt hin) und kann jede
Person antippen, um ihre Angaben zu sehen oder in ihre Nachbarschaft zu
wechseln.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Umfang | Alle Personen des Baums, jede genau einmal, Partner nebeneinander, Kinder darunter. |
| Layout | Das vorhandene Graphviz-Layout des Verwandtschafts-Diagramms (`layoutRelationships` in `src/charts/layout/relationshipLayout.js`) – es ist für genau dieses Netz gebaut (Partnergruppen, rechtwinklige Linien, mehrere Ehen). Kein eigenes Layout. |
| Darstellung | Im Familien-Look auf der bestehenden Leinwand (`GrampsjsFamilyCanvas`): gleiche Karten, Linien, Zoom/Verschieben, Dunkelmodus. |
| Richtung | Immer von oben nach unten (Generationen als Zeilen). Der Richtungs-Umschalter gilt nur für die Familien-Ansicht und wird im ganzen Baum ausgeblendet. |
| Umschalten | Neuer Umschalter „Familie / Ganzer Baum“ in der oberen Leiste. Die Wahl wird pro Gerät gemerkt. Startansicht bleibt „Familie“, bis man umschaltet. |
| Antippen | Im ganzen Baum markiert Antippen die Person und zeigt ihre Angaben (Seitenleiste bzw. Blatt) – inkl. Aktionen. „Familie“ wechselt in die Nachbarschaft der markierten Person. |
| Hervorhebung | Die eigene Person („Du“) hat einen Ring, die markierte Person ist dunkel wie der Fokus in der Familien-Ansicht. Beim Öffnen zentriert der Baum auf die markierte Person, sonst auf „Du“. |
| Bearbeiten | Kein eigenes Bearbeiten im ganzen Baum außer über die Aktionen der Angaben; keine Platzhalter-Karten (der ganze Baum soll ruhig wirken). |

## Architektur

### Daten

`fetchFullTreeGraph(apiGet, locale)` in `familyApi.js`:
`GET /api/people/?profile=self&extend=primary_parent_family,family_list,parent_family_list&locale=…`
(ohne Regeln, ohne Seiten → alle Personen), daraus ein `FamilyGraph`.
Neu laden bei `db:changed`, solange die Ansicht offen ist.

### Layout-Adapter (rein, getestet)

`fullTreeLayout(relLayout, {cardW, cardH})` in `src/family/fullTree.js`
wandelt die Ausgabe von `layoutRelationships(graph, rootHandle, {boxWidth, boxHeight})`
in das Format der Leinwand:

- Personen-Knoten (Mittelpunkt `x/y`) → `{key, kind: 'person', handle, x, y, w, h}` mit linker oberer Ecke.
- Kind-Verbindungen (`links[].points`) → `edges[].points`.
- Familienknoten:
  - nebeneinander stehende Partner → kurze Linie über die Lücke auf Höhe des Markers (`familyMarkerPosition`),
  - Klammer (`bracket {left, right, top}`) → Linienzug `top → Marker → top` wie im Original.
- Alles in positive Koordinaten verschoben (Rand wie im Familien-Layout), `width/height` gesetzt.

`layoutRelationships` braucht `rootHandle` nur als Bezugspunkt; übergeben wird
„Du“, sonst die erste Person.

### Komponenten

- `GrampsjsFamilyApp`: Zustand `_view: 'family' | 'tree'` (localStorage
  `grampsjs_family_view`), Umschalter, Laden über einen zweiten
  `NeighborhoodLoader`-ähnlichen Ablauf (einmalig laden, `reload()` bei
  `db:changed`), Layout asynchron (Graphviz-WASM) mit Ladehinweis.
- `GrampsjsFamilyCanvas`: unverändert bis auf
  - `marked` (Handle mit Ring „Du“) und
  - einen Schalter, ob Antippen navigiert (`family:select`, wie bisher) – im ganzen Baum feuert es `family:mark` und die App zeigt die Angaben.
- `GrampsjsFamilyDetails`: zeigt die markierte Person; zusätzlicher Knopf
  „In der Familie zeigen“ im ganzen Baum.

## Fehler und Grenzen

- Graphviz lädt einmal (WASM, bereits im Projekt); bis das Layout steht:
  „Baum wird gezeichnet …“.
- Fehler beim Laden/Layout → Hinweis mit „Erneut versuchen“, Familien-Ansicht bleibt nutzbar.
- Sehr große Bäume: keine künstliche Grenze; bei Hunderten Personen dauert
  das Layout Sekunden. ponytail: bei Bedarf später Generationen begrenzen.
- Personen, die ohne jede Verbindung im Baum stehen, erscheinen als einzelne
  Karten (Graphviz ordnet sie mit ein).

## Tests

- Vitest: `fullTreeLayout` – Karten-Ecken aus Mittelpunkten, Kind-Linien
  übernommen, Partnerlinie für nebeneinander stehende Partner, Klammer-Linienzug,
  positive Koordinaten, keine Überlappung von Karten.
- Vitest: `fetchFullTreeGraph` – URL ohne Regeln, Fehler durchgereicht.
- Manuell (Playwright, Stack mit Beispieldaten + eigener Familie): Umschalten,
  Zentrieren auf „Du“, Antippen zeigt Angaben, „In der Familie zeigen“,
  Handy und PC, Dunkelmodus.

## Nicht im Umfang

Bearbeiten direkt im Baum (Platzhalter), Links-nach-rechts-Richtung für den
ganzen Baum, Export als Bild, Filtern/Ausblenden von Ästen.
