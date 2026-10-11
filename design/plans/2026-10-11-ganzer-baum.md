# Ganzer Baum – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umschalter „Familie / Ganzer Baum“ im Familien-Modus; der ganze Baum zeigt alle Personen mit dem vorhandenen Graphviz-Layout auf der Familien-Leinwand.

**Architecture:** `fetchFullTreeGraph` lädt alle Personen in einen `FamilyGraph`; `layoutRelationships` (vorhanden) legt sie aus; der reine Adapter `fullTreeLayout` übersetzt das Ergebnis in das Leinwand-Format `{nodes, edges, width, height}`. `GrampsjsFamilyApp` schaltet zwischen den Ansichten um und zeigt im ganzen Baum die Angaben der angetippten Person.

**Tech Stack:** Lit 3 (JS), Vitest + happy-dom, `@hpcc-js/wasm` Graphviz (vorhanden).

**Spec:** `design/2026-10-11-ganzer-baum-design.md`

## Global Constraints

- Branch `full-tree`; Änderungen nur in `src/family/`, `lang/en.json`, `lang/de.json`.
- Prettier/ESLint vor jedem Commit; Texte über `this._()`, Gramps-Strings nicht in `lang/*.json`.
- Karten im ganzen Baum: `CARD = {w: 216, h: 60}` wie in `layout.js`, Rand `PAD = 32`.
- Ganzer Baum immer von oben nach unten; Richtungs-Umschalter dort ausgeblendet.
- Ansichtswahl in `localStorage` `grampsjs_family_view` (`'family' | 'tree'`), Standard `'family'`.
- Commits als `bestora` mit Co-Authored-By/Claude-Session-Zeilen.

## Review Focus

1. **Person ohne jede Verbindung** und **Paar mit mehreren Ehen** im ganzen Baum → Karten überlappen nicht, Klammer-Linien vorhanden. *Test in Task 1 (echtes Graphviz-Layout).*
2. **Leerer Baum / nur eine Person** → kein Absturz, eine Karte bzw. Hinweis. *Test in Task 1.*
3. **Graphviz-Fehler** (WASM lädt nicht) → Hinweis „Erneut versuchen“, Familien-Ansicht bleibt nutzbar. *Task 4, manuell.*
4. **Antippen im ganzen Baum nach Verschieben** → keine Auswahl (bestehendes `isTap`). *Bestehende Tests.*
5. **Aktionen im ganzen Baum** (Person hinzufügen/ändern/Foto) wirken auf die angetippte Person, nicht auf den Fokus der Familien-Ansicht. *Task 4, manuell.*

---

### Task 1: Layout-Adapter

**Files:**
- Create: `src/family/fullTree.js`
- Test: `test/unit/familyFullTree.test.js`

**Interfaces:**
- Consumes: Ausgabe von `layoutRelationships(graph, rootHandle, {boxWidth, boxHeight})` (`src/charts/layout/relationshipLayout.js`): `{nodes, links}`; Personen-Knoten `{key, kind: 'person', handle, x, y}` (Mittelpunkt), Familien-Knoten `{key, kind: 'family', x, y, bracket?: {left, right, top}}`, Links `{points: [[x, y], …]}`; `familyMarkerPosition(boxHeight)` aus `src/charts/familyMarker.js`.
- Produces:
  - `FULL_TREE_CARD = {w: 216, h: 60}`
  - `fullTreeLayout(rel) → {nodes, edges, width, height}` (Leinwand-Format; Personen `kind: 'person'`)
  - `layoutFullTree(graph, rootHandle) → Promise<{nodes, edges, width, height}>`

- [ ] **Step 1: Failing test**

```js
// test/unit/familyFullTree.test.js
import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  fullTreeLayout,
  layoutFullTree,
  FULL_TREE_CARD,
} from '../../src/family/fullTree.js'

const {w, h} = FULL_TREE_CARD

describe('fullTreeLayout', () => {
  const rel = {
    nodes: [
      {key: 'person:A', kind: 'person', handle: 'A', x: 0, y: 0},
      {key: 'person:B', kind: 'person', handle: 'B', x: 240, y: 0},
      {key: 'family:f1', kind: 'family', x: 120, y: 0},
      {
        key: 'family:f2',
        kind: 'family',
        x: 500,
        y: 0,
        bracket: {left: -40, right: 0, top: 30},
      },
      {key: 'person:C', kind: 'person', handle: 'C', x: 120, y: 200},
    ],
    links: [{points: [[120, 20], [120, 100], [120, 170]]}],
  }
  const layout = fullTreeLayout(rel)
  const node = handle => layout.nodes.find(n => n.handle === handle)

  it('turns card centres into corners in positive space', () => {
    expect(node('A')).toMatchObject({kind: 'person', w, h, x: 32, y: 32})
    expect(node('B').x - node('A').x).toBe(240)
    expect(node('C').y - node('A').y).toBe(200)
  })

  it('keeps child links, shifted like the cards', () => {
    const dx = node('A').x + w / 2
    const dy = node('A').y + h / 2
    expect(layout.edges[0].points).toEqual([
      [120 + dx, 20 + dy],
      [120 + dx, 100 + dy],
      [120 + dx, 170 + dy],
    ])
  })

  it('draws a short line between adjacent partners and a bracket otherwise', () => {
    // 1 child link, 1 partner line, 1 bracket
    expect(layout.edges).toHaveLength(3)
    const bracket = layout.edges[2].points
    expect(bracket).toHaveLength(4)
  })

  it('reports a size that holds everything', () => {
    for (const n of layout.nodes) {
      expect(n.x + n.w).toBeLessThanOrEqual(layout.width)
      expect(n.y + n.h).toBeLessThanOrEqual(layout.height)
    }
    for (const e of layout.edges) {
      for (const [x, y] of e.points) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('copes with an empty tree', () => {
    expect(fullTreeLayout({nodes: [], links: []})).toEqual({
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
    })
  })
})

describe('layoutFullTree with Graphviz', () => {
  const ref = r => ({ref: r})
  const fam = (handle, father, mother, children = []) => ({
    handle,
    father_handle: father,
    mother_handle: mother,
    child_ref_list: children.map(ref),
    type: 'Married',
  })
  // M has two marriages (W1, W2) with a child each; L stands alone
  const f1 = fam('f1', 'M', 'W1', ['C1'])
  const f2 = fam('f2', 'M', 'W2', ['C2'])
  const p = (handle, ext = {}) => ({handle, gramps_id: handle, extended: ext})
  const graph = new FamilyGraph([
    p('M', {families: [f1, f2]}),
    p('W1', {families: [f1]}),
    p('W2', {families: [f2]}),
    p('C1', {primary_parent_family: f1}),
    p('C2', {primary_parent_family: f2}),
    p('L'),
  ])

  it('places every person once without overlapping cards', async () => {
    const layout = await layoutFullTree(graph, 'M')
    const cards = layout.nodes
    expect(cards.map(n => n.handle).sort()).toEqual([
      'C1',
      'C2',
      'L',
      'M',
      'W1',
      'W2',
    ])
    const overlaps = (a, b) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        expect(overlaps(cards[i], cards[j])).toBe(false)
      }
    }
    expect(layout.edges.length).toBeGreaterThanOrEqual(4)
  })

  it('lays out a single person', async () => {
    const layout = await layoutFullTree(new FamilyGraph([p('X')]), 'X')
    expect(layout.nodes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run – Expected FAIL** (`npx vitest run test/unit/familyFullTree.test.js`, Import fehlt)

- [ ] **Step 3: Implementation**

```js
// src/family/fullTree.js
// The whole tree for the family canvas: the relationship chart's Graphviz
// layout, translated into the canvas format.
import {layoutRelationships} from '../charts/layout/relationshipLayout.js'
import {familyMarkerPosition} from '../charts/familyMarker.js'

export const FULL_TREE_CARD = {w: 216, h: 60}
const PAD = 32
const PARTNER_LINE = 11

export function fullTreeLayout(rel) {
  const {w, h} = FULL_TREE_CARD
  const people = rel.nodes.filter(n => n.kind === 'person')
  if (!people.length) return {nodes: [], edges: [], width: 0, height: 0}
  const [, markerY] = familyMarkerPosition(h)
  const lines = rel.links.map(link => link.points)
  for (const family of rel.nodes.filter(n => n.kind === 'family')) {
    const y = family.y + markerY
    if (family.bracket) {
      const {left, right, top} = family.bracket
      lines.push([
        [family.x + left, family.y + top],
        [family.x + left, y],
        [family.x + right, y],
        [family.x + right, family.y + top],
      ])
    } else {
      lines.push([
        [family.x - PARTNER_LINE, y],
        [family.x + PARTNER_LINE, y],
      ])
    }
  }
  const xs = [
    ...people.map(n => n.x - w / 2),
    ...lines.flat().map(([x]) => x),
  ]
  const ys = [
    ...people.map(n => n.y - h / 2),
    ...lines.flat().map(([, y]) => y),
  ]
  const dx = PAD - Math.min(...xs)
  const dy = PAD - Math.min(...ys)
  const nodes = people.map(n => ({
    key: n.key,
    kind: 'person',
    handle: n.handle,
    x: n.x - w / 2 + dx,
    y: n.y - h / 2 + dy,
    w,
    h,
  }))
  const edges = lines.map(points => ({
    points: points.map(([x, y]) => [x + dx, y + dy]),
  }))
  const width = Math.max(...xs) + dx + w + PAD
  const height = Math.max(...ys) + dy + h + PAD
  return {nodes, edges, width, height}
}

export async function layoutFullTree(graph, rootHandle) {
  const rel = await layoutRelationships(graph, rootHandle, {
    boxWidth: FULL_TREE_CARD.w,
    boxHeight: FULL_TREE_CARD.h,
  })
  return fullTreeLayout(rel)
}
```

Hinweis zu `width/height`: `Math.max(...xs)` ist die größte linke Kante bzw. Linien-x; `+ w` deckt die rechte Kartenkante ab (Linien liegen innerhalb). Schlägt „reports a size“ fehl, `width = Math.max(...nodes.map(n => n.x + n.w), ...edges.flat…) + PAD` berechnen.

- [ ] **Step 4: Run – Expected PASS** (7 Tests). Graphviz lädt in Vitest das WASM aus `node_modules` (wie `test/unit/relationshipLayout.test.js`).

- [ ] **Step 5: Commit** – `git add src/family/fullTree.js test/unit/familyFullTree.test.js` · „Add full tree layout for the family canvas“

---

### Task 2: Alle Personen laden

**Files:**
- Modify: `src/family/familyApi.js`
- Test: `test/unit/familyApi.test.js` (anhängen)

**Interfaces:**
- Produces: `fetchFullTreeGraph(apiGet, locale) → Promise<{graph: FamilyGraph} | {error}>`

- [ ] **Step 1: Failing test** (anhängen)

```js
describe('fetchFullTreeGraph', () => {
  it('loads every person with their families', async () => {
    let url = ''
    const res = await fetchFullTreeGraph(async u => {
      url = u
      return {data: [{handle: 'A', gramps_id: 'I1'}]}
    }, 'de')
    expect(url).toBe(
      '/api/people/?profile=self&extend=primary_parent_family,family_list,parent_family_list&locale=de'
    )
    expect(res.graph.person('A').gramps_id).toBe('I1')
  })

  it('passes errors through', async () => {
    expect(await fetchFullTreeGraph(async () => ({error: 'x'}), 'de')).toEqual({
      error: 'x',
    })
  })
})
```

Import `fetchFullTreeGraph` im Kopf der Testdatei ergänzen.

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Implementation** (anhängen an `familyApi.js`)

```js
export async function fetchFullTreeGraph(apiGet, locale) {
  const res = await apiGet(
    `/api/people/?profile=self&extend=${EXTEND}&locale=${locale}`
  )
  if ('error' in res) return {error: res.error}
  return {graph: new FamilyGraph(res.data ?? [])}
}
```

- [ ] **Step 4: Run – Expected PASS**

- [ ] **Step 5: Commit** – „Load the whole tree for the family canvas“

---

### Task 3: Leinwand – Ring für „Du“ und Antipp-Ereignis

**Files:**
- Modify: `src/family/GrampsjsFamilyCanvas.js`

**Interfaces:**
- Produces: Properties `marked: String` (Karte mit Ring) und `tapEvent: String` (Standard `'family:select'`); Antippen feuert `this.tapEvent` mit `{handle}`.

- [ ] **Step 1: Implementation**
  - Properties: `marked: {type: String}`, `tapEvent: {type: String}`; Konstruktor `this.marked = ''; this.tapEvent = 'family:select'`.
  - In `_select(e, handle)`: `fireEvent(this, this.tapEvent, {handle})` statt `'family:select'`.
  - In `_renderCard`: Klasse `me` wenn `node.handle === this.marked`.
  - CSS:

```css
        .card.me {
          box-shadow: 0 0 0 3px var(--fm-moss);
        }
        .card.focus.me {
          box-shadow: 0 0 0 3px var(--fm-moss), 0 0 0 9px rgba(30, 43, 36, 0.12);
        }
```

- [ ] **Step 2: Lint, Build, Tests** – `npx --no-install eslint src/family && npm test && npm run build`

- [ ] **Step 3: Commit** – „Let the family canvas mark a person and choose its tap event“

---

### Task 4: Umschalter und Ansicht „Ganzer Baum“

**Files:**
- Modify: `src/family/GrampsjsFamilyApp.js`, `src/family/GrampsjsFamilyDetails.js`, `lang/en.json`, `lang/de.json`

**Interfaces:**
- Consumes: Task 1–3; bestehender `NeighborhoodLoader`-Fluss für die Familien-Ansicht bleibt unverändert.
- Produces: `GrampsjsFamilyDetails` Property `familyLink: Boolean` → Knopf „In der Familie zeigen“, feuert `family:show-family`.

- [ ] **Step 1: App-Zustand**
  - Properties: `_view` (`'family' | 'tree'`), `_tree` (`null | {graph, layout}`), `_treeState` (`'' | 'loading' | 'error'`), `_marked` (Handle).
  - Konstruktor: `_view` aus `localStorage['grampsjs_family_view']` (try/catch, Standard `'family'`), `_tree = null`, `_treeState = ''`, `_marked = ''`.
  - Getter:

```js
  get _inTree() {
    return this._view === 'tree'
  }

  // the person whose details and actions are shown
  get _selected() {
    return this._inTree ? this._marked || this._me : this._focus
  }

  get _selectedGraph() {
    return this._inTree ? this._tree?.graph : this._graph
  }
```

- [ ] **Step 2: Laden des ganzen Baums**

```js
  async _loadTree() {
    this._treeState = 'loading'
    const res = await fetchFullTreeGraph(this.appState.apiGet, this._locale)
    if ('error' in res) {
      this._treeState = 'error'
      return
    }
    const people = res.graph.people()
    const root = this._me || people[0]?.handle
    try {
      const layout = root
        ? await layoutFullTree(res.graph, root)
        : {nodes: [], edges: [], width: 0, height: 0}
      this._tree = {graph: res.graph, layout}
      this._treeState = ''
    } catch (e) {
      this._treeState = 'error'
    }
  }

  _setView(view) {
    this._view = view
    try {
      localStorage.setItem('grampsjs_family_view', view)
    } catch (e) {
      // ignore
    }
    if (view === 'tree' && !this._tree) this._loadTree()
  }
```

  - In `connectedCallback` nach dem bestehenden Code: `if (this._inTree) this._loadTree()`.
  - `_onDbChanged` erweitern: `this._loader.reload(); if (this._tree) this._loadTree()`.
  - Nach dem Laden ist `_kinship` für `_selected` zu berechnen: `_loadKinship()` nutzt statt `this._focus` jetzt `this._selected` und statt `this._graph` `this._selectedGraph`; zusätzlich aufrufen, wenn sich `_marked` oder `_view` ändert (in `updated(changed)`: `if (changed.has('_marked') || changed.has('_view')) this._loadKinship()`).

- [ ] **Step 3: Umschalter und Rendern**
  - In der oberen Leiste vor der Richtungs-Gruppe:

```js
          <div class="seg float" role="group" aria-label="${this._('View')}">
            <button
              aria-pressed="${!this._inTree}"
              @click="${() => this._setView('family')}"
            >
              ${this._('Family')}
            </button>
            <button
              aria-pressed="${this._inTree}"
              @click="${() => this._setView('tree')}"
            >
              ${this._('Whole tree')}
            </button>
          </div>
```

    (`.seg button` bekommt für diese Gruppe `width: auto; padding: 0 12px;` über eine Klasse `.seg.text button`.)
  - Die Richtungs-Gruppe nur rendern, wenn `!this._inTree`.
  - Leinwand:

```js
        <grampsjs-family-canvas
          .appState="${this.appState}"
          .layout="${this._inTree ? this._tree?.layout ?? EMPTY_LAYOUT : layout}"
          .cards="${this._inTree ? this._treeCards() : cards}"
          .selected="${this._selected}"
          .marked="${this._me}"
          .tapEvent="${this._inTree ? 'family:mark' : 'family:select'}"
          @family:select="${this._select}"
          @family:mark="${e => {
            this._marked = e.detail.handle
          }}"
          @family:add="${e => this._openAdd(e.detail.relation)}"
        ></grampsjs-family-canvas>
```

    mit `_treeCards()` analog zu `_cards()` über `this._tree?.graph`, gecacht solange `this._tree` gleich bleibt (`if (this._treeCardsFor !== this._tree) {…}`).
  - Hinweise: bei `_inTree && _treeState === 'loading'` „Baum wird gezeichnet …“; bei `'error'` Text „Der Baum konnte nicht gezeichnet werden.“ plus Knopf „Erneut versuchen“ (`@click=${this._loadTree}`), im `.empty`-Overlay (dort für den Knopf `pointer-events: auto`).
  - Details, Dialoge: überall `this._focus` → `this._selected` und `this._graph` → `this._selectedGraph` für `.card`, `.relatives`, `isMe`, `.focusPerson`, `.graph`, `.handle`. `_relatives(cards)` nutzt `buildNeighborhood(this._selectedGraph, this._selected)` und die passenden Karten (`this._inTree ? this._treeCards() : cards`).
  - Details: `?familyLink="${this._inTree}"` und `@family:show-family="${this._showInFamily}"` mit

```js
  _showInFamily() {
    const person = this._selectedGraph?.person(this._selected)
    this._setView('family')
    if (person) fireEvent(this, 'nav', {path: `person/${person.gramps_id}`})
  }
```

  - `willUpdate`: `details`-Attribut wenn eine Person ausgewählt ist: `Boolean(this._selectedGraph && this._selected)`.

- [ ] **Step 4: Details-Knopf** – in `GrampsjsFamilyDetails.js` Property `familyLink`, im Aktionsblock als erster Knopf (auch ohne Bearbeitungsrechte sichtbar):

```js
      ${this.familyLink
        ? html`<div class="actions">
            <button @click="${() => fireEvent(this, 'family:show-family')}">
              ${this._('Show in the family')}
            </button>
          </div>`
        : ''}
```

- [ ] **Step 5: Übersetzungen** – Schlüssel `View` (Ansicht), `Whole tree` (Ganzer Baum), `Show in the family` (In der Familie zeigen), `Drawing the tree …` (Baum wird gezeichnet …), `The tree could not be drawn.` (Der Baum konnte nicht gezeichnet werden.), `Try again` (Erneut versuchen); Gramps-Strings per `src/strings.js`-Abgleich auslassen (wie in den früheren Plänen).

- [ ] **Step 6: Lint, Tests, Build, Commit** – „Add the whole-tree view to family mode“

---

### Task 5: Prüfung, Deployment

- [ ] Lokaler Stack mit Beispieldaten: Umschalten, Zentrieren auf „Du“, Antippen → Angaben, „In der Familie zeigen“, Aktionen im Baum auf der angetippten Person, Handy/PC, Dunkelmodus; Graphviz-Laufzeit bei 2157 Personen notieren.
- [ ] Screenshot in README ergänzen (`images/family-mode-tree.png`, nur Beispieldaten).
- [ ] Merge `full-tree` → `main`, Push, Server: `git pull`, `docker compose up -d --build web`, HTTPS-Check.
