# Familien-Modus – Design

Stand: 11.10.2026 · Entwürfe: `.superpowers/brainstorm/` (lokal, nicht im Repo)

## Ziel

Eine zweite, stark vereinfachte Oberfläche für Familienmitglieder, die über den
Share-Link kommen. Sie sollen den Stammbaum erkunden, Personen ergänzen,
Fotos hochladen und Angaben korrigieren können – ohne Gramps-Fachbegriffe,
auf Handy, Tablet und PC gleichermaßen. Die volle Gramps-Oberfläche bleibt
unverändert für Admins.

Erfolg heißt: Ein älteres Familienmitglied öffnet den Link, findet sich selbst
im Baum und trägt ohne Hilfe ein Enkelkind mit Geburtsdatum ein.

## Entscheidungen (mit dem Auftraggeber abgestimmt)

| Thema | Entscheidung |
|---|---|
| Konzept | Zwei Oberflächen, gleiche Daten. Neue UI in `src/family/`, bestehende UI bleibt unberührt (Upstream-Merges bleiben einfach). |
| Wer sieht was | Admin legt pro Account fest. Standard: Owner/Admin → volle UI, alle anderen → Familien-Modus. |
| Hauptansicht | Stammbaum-Leinwand (verschieb-/zoombar), die immer nur die **Nachbarschaft** der gewählten Person zeigt; Äste lassen sich aufklappen. Kein „ganzer Baum“. |
| Ausrichtung | Umschaltbar „links → rechts“ / „oben → unten“. Standard: links → rechts (auf allen Geräten). Wahl wird pro Gerät gemerkt. |
| Details | PC/Tablet (≥ 992 px): Seitenleiste rechts. Handy: Blatt von unten. |
| Mehrere Ehen | Alle Partner werden bei der Person gezeigt, Kinder nach Partner gruppiert. Beim Kind-Hinzufügen „Mit wem?“, sobald es mehr als einen Partner gibt. |
| Geschichten | Nebensache: als „Erinnerung“ unter „Weitere Angaben“ beim Bearbeiten. |
| „Du“ | Beim ersten Login automatisch per Name mit einer Person verknüpfen; bei mehreren Treffern Auswahl; bei keinem Treffer optional sich selbst anlegen oder überspringen. Später änderbar. |
| Volle UI | Bleibt wie sie ist. Owner/Admins wechseln jederzeit hin und her: „Familien-Modus ansehen“ in der vollen UI, „Zur vollen Ansicht“ im Konto-Menü des Familien-Modus. |

## Architektur

### Einstieg

`GrampsJs.renderContent()` bekommt nach den Pre-Ready-Prüfungen genau einen
Abzweig: Ist für den angemeldeten Account der Familien-Modus aktiv, wird statt
Drawer/AppBar/`grampsjs-pages` das Element `<grampsjs-family-app>` gerendert.
Globale Overlays in `render()` (Snackbar, Fehler, `grampsjs-undo-transaction`)
und die Event-Listener (`nav`, `db:changed`, `grampsjs:error`) bleiben und
werden mitgenutzt.

Routing im Familien-Modus: `/` = Leinwand mit „Du“ im Fokus,
`/person/<gramps_id>` = Leinwand mit dieser Person im Fokus (teilbar, Zurück-Taste
funktioniert). Alle anderen Pfade leiten auf `/` um.

### Modus-Auflösung

`resolveUiMode({role, username, treeConfig})` – reine Funktion:

1. `treeConfig['frontend.uiModes'][username]` gesetzt → dieser Wert (`'family' | 'full'`).
2. sonst `role >= ROLE_OWNER` → `'full'`, sonst `'family'`.

Die Rolle kommt aus `GET /api/users/-/` (wird beim Start einmal geladen und in
`appState.user` abgelegt). Owner/Admins können zusätzlich jederzeit umschalten – in beide Richtungen
(`localStorage`, nur Ansicht – keine Rechteänderung). Der Schalter erscheint
nur für Accounts mit `role >= ROLE_OWNER`.

Das ist eine Bedienentscheidung, keine Rechtesperre: Was ein Account darf,
regelt weiter seine Rolle.

### Datenhaltung

| Daten | Ort | Schreibrecht |
|---|---|---|
| UI-Modus pro Account | Tree-Config `frontend.uiModes` (`{username: 'family'\|'full'}`) | Owner (bestehender `PUT /api/trees/-/config`) |
| Account → Person | Tree-Config `frontend.userPersons` (`{username: personHandle}`) | **neu:** `PUT /api/users/-/person/` im API-Fork – jeder angemeldete User setzt nur seinen eigenen Eintrag (`PERM_EDIT_OWN_USER`); Owner können über die Benutzerverwaltung beliebige setzen. Grund: Tree-Config darf sonst nur der Owner schreiben. |
| Ausrichtung, aufgeklappte Äste | `localStorage` | Gerät |

### Module (`src/family/`)

| Datei | Aufgabe |
|---|---|
| `GrampsjsFamilyApp.ts` | Rahmen: Leinwand + Detailbereich, Routing, Onboarding-Weiche |
| `GrampsjsFamilyCanvas.ts` | Leinwand (Pan/Zoom per Pointer-Events + CSS-Transform), rendert Karten und Linien als SVG |
| `neighborhood.ts` | **rein:** baut aus API-Daten das Nachbarschafts-Modell (Fokus, Eltern, Großeltern kompakt, Partner in Reihenfolge, Kinder je Familie, Nachkommen-Zahl, aufgeklappte Äste) |
| `layout.ts` | **rein:** Raster-Layout des Modells für beide Ausrichtungen (feste Kartengröße, Spalten-/Zeilenabstände, orthogonale Linien) |
| `GrampsjsFamilyDetails.ts` | Seitenleiste bzw. Bottom-Sheet: Name, Verwandtschaft zu „Du“, Lebensdaten, Aktionen |
| `GrampsjsFamilyAddPerson.ts` | Ablauf „Person hinzufügen“ (Beziehung → Formular → Speichern) |
| `GrampsjsFamilyPersonForm.ts` | gemeinsames Kurzformular für Hinzufügen und Ändern |
| `GrampsjsFamilyPhoto.ts` | Foto hochladen |
| `GrampsjsFamilyOnboarding.ts` | „Bist du das?“ beim ersten Login |
| `familyStyles.ts` | Design-Tokens und Grundstile des Familien-Modus |

Wiederverwendet werden: `appState.apiGet/apiPost/apiPut`, `util/familyLinks.js`
(`linkParent`, `linkChild`, `linkSpouse`), `POST /api/objects/` für Person +
Ereignisse in einem Rutsch, Medien-Upload wie in `GrampsjsFormNewMedia`,
`grampsjs-undo-transaction` für „Rückgängig“, `grampsjs-icon`.

## Bildschirme und Abläufe

### Leinwand

- Schwebende Leiste oben: „Zu mir“, große Suche (`/api/search/`, nur Personen),
  Umschalter Ausrichtung; Zoom-Knöpfe unten rechts (PC).
- Spalten (bzw. Zeilen bei oben → unten): Großeltern (kompakt) · Eltern · Fokus
  mit Partnern · Kinder (gruppiert nach Partner, mit Beschriftung „mit Karl“) ·
  Nachkommen als Zahl. „↑ weitere Generationen“ bzw. „9 Nachkommen“ klappen den
  Ast auf; die Leinwand wächst mit.
- Tippen auf eine Karte: Person wird Fokus, Leinwand zentriert weich auf sie
  (bei `prefers-reduced-motion` ohne Animation).
- Fehlende Personen erscheinen als gestrichelte Felder („+ Kind“, „+ Mutter“),
  die direkt in Schritt 2 von „Person hinzufügen“ springen. Nur wenn
  `permissions.canAdd`.
- Karten: Initialen oder Profilfoto, Name, Jahre bzw. Rolle. Alle gleich groß;
  der Fokus ist farbig hervorgehoben, nicht größer.

### Details

- Name, Geburtsname, „deine Großtante“ (aus `GET /api/relations/<du>/<person>`:
  `relationship_string`) und die gemeinsamen Vorfahren (`common_ancestors`).
- Geboren / Gestorben (Datum + Ort), Anzahl Fotos.
- Aktionen: **Person hinzufügen** (Akzentfarbe), Foto hochladen, Angaben ändern.
- Ohne verknüpfte „Du“-Person entfällt die Verwandtschaftszeile.

### Person hinzufügen

1. **Wen?** Mutter oder Vater · Partner · Kind · Geschwister. Bereits volle
   Plätze (zwei Eltern) sind ausgegraut.
2. **Angaben:** „Mit wem?“ (nur bei Kind und mehr als einem Partner; Optionen:
   Partner + „anderer“) · Tochter/Sohn (bzw. passend zur Beziehung) · Vorname ·
   Nachname (vorgeschlagen) · Geboren am (Tag.Monat.Jahr oder nur Jahr) ·
   Geboren in (Ortssuche, neuer Ort anlegbar) · Lebt noch (aus → Gestorben am/in).
   Ab drei getippten Buchstaben: Dublettensuche; „Meinst du diese Person?“ →
   **Verknüpfen** statt neu anlegen.
3. **Speichern:** Person + Ereignisse per `POST /api/objects/`, dann Verknüpfung:
   - Kind → `linkChild` in die Familie mit dem gewählten Partner (bzw. neue Familie)
   - Partner → `linkSpouse` (neue Familie)
   - Mutter/Vater → `linkParent`
   - Geschwister → als Kind in die Elternfamilie der Fokus-Person; gibt es keine,
     wird eine leere Elternfamilie angelegt.
   Danach erscheint die Person hervorgehoben im Baum, Snackbar „Lisa Weber
   hinzugefügt · Rückgängig“.

### Foto hochladen

Kamera/Galerie (`<input type="file" accept="image/*" capture>`), Vorschau,
„Wer ist auf dem Foto?“ (Namens-Chips, aktuelle Person vorausgewählt, weitere per
Suche), „Wann ungefähr?“, optionale Beschreibung, „Als Profilbild verwenden“
(→ Medienverweis an Position 0 der `media_list`). Ablauf: `POST /api/media/` →
`PUT /api/media/<h>` (Beschreibung, Datum) → Medienverweis an jede markierte Person.

### Angaben ändern

Dasselbe Kurzformular, vorausgefüllt; zusätzlich Geburtsname. „Weitere Angaben“
klappt auf: Rufname, Beruf (Ereignis „Beruf“), Erinnerung (Notiz, reiner Text,
kein Rich-Text-Editor). Speichern: `PUT` auf Person und betroffene Ereignisse.

### Onboarding beim ersten Login

Ist für den Account keine Person verknüpft: Personensuche nach dem
Account-Namen (`full_name`).
- genau ein Treffer → automatisch verknüpfen, Hinweis „Du bist mit Max Müller
  verbunden. Ändern“
- mehrere → „Welche Person bist du?“ mit Lebensdaten und Eltern zur Unterscheidung
- keiner → „Dich gibt es noch nicht im Baum“: **Mich hinzufügen** (Kurzformular,
  danach Beziehung zu einer bestehenden Person wählen) oder **Später**.

Änderbar über das Konto-Menü („Das bin ich nicht“).

### Admin

Benutzerverwaltung bekommt pro Account die Spalten **Oberfläche**
(Familie/Voll/Standard) und **Person** (Auswahl per Personensuche).

## Gestaltung

- Schriften: *Atkinson Hyperlegible* (UI, für Sehschwäche entwickelt) und
  *Literata* (Namen). Werden in `fonts/` selbst gehostet – kein Google-Abruf zur
  Laufzeit.
- Farben (Tokens in `familyStyles.ts`): Papier `#f7f8f5`, Tinte `#1e2b24`,
  Moos `#3e6a50`, Linie `#a9baae`, Blatt `#e3ece5`, Akzent „hinzufügen“
  `#a8661a` (einzige Akzentfarbe). Dunkelmodus über dieselben Tokens.
- Grundschrift 17 px, Bedienflächen mindestens 44 × 44 px, sichtbarer
  Tastaturfokus, Kontrast WCAG AA.
- Sprache: Du-Form, Alltagswörter („Geboren in“ statt „Ereignis Geburt, Ort“).
  Neue Texte in `lang/en.json` + `lang/de.json`.

## Fehler und Sonderfälle

- API-Fehler → bestehender `grampsjs:error`-Snackbar mit verständlicher Meldung;
  Formulare behalten ihre Eingaben.
- Ohne `canAdd`/`canEdit` (z. B. Gast-Rolle) keine Bearbeiten-Aktionen und keine
  gestrichelten Felder.
- Personen ohne Eltern/Kinder: Leinwand zeigt nur die gestrichelten Felder.
- Leerer Baum: Onboarding startet mit „Mich hinzufügen“.
- Private Personen bleiben nach den bestehenden Regeln der API verborgen.

## Tests

- Vitest (rein): `resolveUiMode`, `neighborhood` (mehrere Ehen, Halbgeschwister,
  fehlende Eltern), `layout` (beide Ausrichtungen, keine Überlappung),
  Namensabgleich fürs Onboarding, Datums-Eingabe („1958“, „3.5.1932“).
- Pytest im API-Fork: `PUT /api/users/-/person/` (eigener Eintrag ja, fremder nein,
  Owner darf fremde).
- Manuell per Playwright-Screenshots: Leinwand Handy/PC in beiden Ausrichtungen,
  alle drei Abläufe.

## Reihenfolge

1. Modus-Auflösung, Rahmen, Leinwand mit Nachbarschaft, Details, Suche, „Zu mir“
2. Onboarding + Person-Endpoint im API-Fork, Verwandtschaftsangabe
3. Person hinzufügen (inkl. mehrere Ehen, Dubletten)
4. Angaben ändern, Foto hochladen
5. Admin-Spalten in der Benutzerverwaltung

## Nicht im Umfang

Ganzer-Baum-Ansicht, vollständige Verwandtschaftskette mit allen
Zwischenpersonen (zunächst nur Grad + gemeinsame Vorfahren), Dubletten
zusammenführen, Rich-Text, mehrere Stammbäume, Änderungen an der vollen UI.
