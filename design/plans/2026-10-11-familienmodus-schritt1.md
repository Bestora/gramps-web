# Familien-Modus Schritt 1 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein lesender Familien-Modus: Accounts unterhalb der Owner-Rolle sehen statt der vollen Gramps-Oberfläche eine Stammbaum-Leinwand mit der Nachbarschaft einer Person, Suche, „Zu mir“, umschaltbarer Ausrichtung und Detailbereich. Owner/Admins können zwischen beiden Ansichten wechseln.

**Architecture:** Neuer Ordner `src/family/`. Reine Module (`uiMode.js`, `neighborhood.js`, `layout.js`, `personCard.js`, `familyApi.js`) sind unit-getestet; Lit-Komponenten (`GrampsjsFamilyApp`, `GrampsjsFamilyCanvas`, `GrampsjsFamilyDetails`) rendern sie. `GrampsJs.renderContent()` bekommt genau einen Abzweig auf `<grampsjs-family-app>`. Daten kommen aus dem bestehenden People-Endpoint mit Vorfahren-/Nachkommen-Regeln und werden über das vorhandene `FamilyGraph` indiziert.

**Tech Stack:** Lit 3 (JS, wie alle Komponenten im Repo), Vitest + happy-dom, Gramps Web API.

**Spec:** `design/2026-10-11-familienmodus-design.md`

## Global Constraints

- Neue UI nur in `src/family/`; bestehende Dateien nur an den in den Tasks genannten Stellen ändern (Upstream-Merges).
- Prettier-Stil des Repos: einfache Anführungszeichen, keine Semikolons, keine Klammern um einzelne Arrow-Parameter, kein Bracket-Spacing. Vor jedem Commit `npx --no-install prettier --write <dateien>` und `npx --no-install eslint <dateien>`.
- Icons nur über `<grampsjs-icon path="${mdiX}">`.
- Alle sichtbaren Texte über `this._('…')`; neue Schlüssel in `lang/en.json` (Englisch = Schlüssel) und `lang/de.json` (Deutsch, 4 Leerzeichen Einzug).
- Farben: Papier `#f7f8f5`, Tinte `#1e2b24`, Moos `#3e6a50`, Linie `#a9baae`, Blatt `#e3ece5`, Akzent `#a8661a`. Schriften: Atkinson Hyperlegible (UI), Literata (Namen), selbst gehostet.
- Grundschrift 17 px, Bedienflächen ≥ 44 × 44 px, sichtbarer Fokus, `prefers-reduced-motion` respektieren.
- Detailbereich: ab 992 px Breite Seitenleiste rechts, darunter Bottom-Sheet.
- Standard-Ausrichtung `ltr`, Wahl pro Gerät in `localStorage` (`grampsjs_family_orientation`).
- Commits als `bestora <dennisrehbehn@googlemail.com>` (repo-lokal bereits gesetzt) mit den Co-Authored-By/Claude-Session-Zeilen.

## Abweichungen von der Spezifikation (bewusst, mit Auftraggeber abgestimmt)

- Dateien sind `.js` statt `.ts` – im Repo gibt es keine TS-Komponenten.
- Statt in-place Aufklappen macht Tippen auf Großeltern oder „3 Kinder“ diese Person zum Fokus.
- Unter Kindern steht die Zahl ihrer Kinder, nicht aller Nachkommen.
- Verwandtschaftsangabe, Onboarding, Bearbeiten und Admin-Spalten folgen in späteren Plänen. „Zu mir“ nutzt in Schritt 1 `frontend.userPersons[username]` aus der Tree-Config, sonst die Startperson aus den Einstellungen (`settings.homePerson`).

## Review Focus

1. Person mit **mehreren Ehen**, davon eine ohne Partner (unbekannter Elternteil) → alle Familien sichtbar, Kinder korrekt gruppiert, keine Überlappung. *Test in Task 2 und 3.*
2. Person **ohne Eltern / ohne Kinder / ganz allein** → Leinwand zeigt nur die vorhandenen Karten, kein Absturz. *Test in Task 2 und 3.*
3. Partner, der **nicht in der Vorfahren/Nachkommen-Abfrage** enthalten ist → wird nachgeladen und mit Namen angezeigt. *Test in Task 4.*
4. Account-Infos (`/api/users/-/`) **schlagen fehl** (alte API, Netz) → volle UI statt weißer Seite. *Test in Task 1 (`resolveUiMode` mit `role` undefined) und Verhalten in Task 7.*
5. **Geburtsdatum unvollständig oder fremd formatiert** („um 1900“, „1932-05-03“, leer) → Jahr wird erkannt oder weggelassen, nie „undefined“. *Test in Task 2b (`personCard`).*

---

### Task 1: Modus-Auflösung

**Files:**
- Create: `src/family/uiMode.js`
- Test: `test/unit/familyUiMode.test.js`

**Interfaces:**
- Produces:
  - `UI_MODE_FAMILY = 'family'`, `UI_MODE_FULL = 'full'`, `ROLE_OWNER = 4`
  - `TREE_CONFIG_UI_MODES = 'frontend.uiModes'`, `TREE_CONFIG_USER_PERSONS = 'frontend.userPersons'`
  - `resolveUiMode({role, username, treeConfig, override}) → 'family' | 'full'`
  - `canSwitchUiMode(role) → boolean`
  - `getUiModeOverride() → string | null`, `setUiModeOverride(mode | null) → void`

- [ ] **Step 1: Write the failing test**

```js
// test/unit/familyUiMode.test.js
import {describe, it, expect, beforeEach} from 'vitest'
import {
  resolveUiMode,
  canSwitchUiMode,
  getUiModeOverride,
  setUiModeOverride,
  UI_MODE_FAMILY,
  UI_MODE_FULL,
  TREE_CONFIG_UI_MODES,
} from '../../src/family/uiMode.js'

const config = modes => ({[TREE_CONFIG_UI_MODES]: modes})

describe('resolveUiMode', () => {
  it('defaults owners and admins to the full UI', () => {
    expect(resolveUiMode({role: 4, username: 'o'})).toBe(UI_MODE_FULL)
    expect(resolveUiMode({role: 5, username: 'a'})).toBe(UI_MODE_FULL)
  })

  it('defaults everyone else to the family UI', () => {
    expect(resolveUiMode({role: 3, username: 'e'})).toBe(UI_MODE_FAMILY)
    expect(resolveUiMode({role: 0, username: 'g'})).toBe(UI_MODE_FAMILY)
  })

  it('falls back to the full UI when the role is unknown', () => {
    expect(resolveUiMode({role: undefined, username: ''})).toBe(UI_MODE_FULL)
  })

  it('uses the per-account setting from the tree config', () => {
    const treeConfig = config({e: 'full', o: 'family'})
    expect(resolveUiMode({role: 3, username: 'e', treeConfig})).toBe(
      UI_MODE_FULL
    )
    expect(resolveUiMode({role: 4, username: 'o', treeConfig})).toBe(
      UI_MODE_FAMILY
    )
  })

  it('ignores invalid tree config values', () => {
    const treeConfig = config({e: 'fancy'})
    expect(resolveUiMode({role: 3, username: 'e', treeConfig})).toBe(
      UI_MODE_FAMILY
    )
  })

  it('lets owners override the view locally, but not others', () => {
    expect(resolveUiMode({role: 4, username: 'o', override: 'family'})).toBe(
      UI_MODE_FAMILY
    )
    expect(resolveUiMode({role: 3, username: 'e', override: 'full'})).toBe(
      UI_MODE_FAMILY
    )
  })
})

describe('canSwitchUiMode', () => {
  it('is true from the owner role up', () => {
    expect(canSwitchUiMode(4)).toBe(true)
    expect(canSwitchUiMode(3)).toBe(false)
    expect(canSwitchUiMode(undefined)).toBe(false)
  })
})

describe('UI mode override', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through localStorage', () => {
    expect(getUiModeOverride()).toBe(null)
    setUiModeOverride('family')
    expect(getUiModeOverride()).toBe('family')
    setUiModeOverride(null)
    expect(getUiModeOverride()).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/familyUiMode.test.js`
Expected: FAIL – `Failed to resolve import "../../src/family/uiMode.js"`

- [ ] **Step 3: Write minimal implementation**

```js
// src/family/uiMode.js
// Decides whether an account sees the simplified family UI or the full UI.
// This is a matter of presentation only; permissions come from the role.

export const UI_MODE_FAMILY = 'family'
export const UI_MODE_FULL = 'full'
export const ROLE_OWNER = 4
export const TREE_CONFIG_UI_MODES = 'frontend.uiModes'
export const TREE_CONFIG_USER_PERSONS = 'frontend.userPersons'

const OVERRIDE_KEY = 'grampsjs_ui_mode_override'
const isMode = mode => mode === UI_MODE_FAMILY || mode === UI_MODE_FULL

export function canSwitchUiMode(role) {
  return (role ?? -1) >= ROLE_OWNER
}

export function resolveUiMode({role, username, treeConfig = {}, override}) {
  if (role === undefined || role === null) {
    return UI_MODE_FULL
  }
  if (canSwitchUiMode(role) && isMode(override)) {
    return override
  }
  const configured = treeConfig?.[TREE_CONFIG_UI_MODES]?.[username]
  if (isMode(configured)) {
    return configured
  }
  return canSwitchUiMode(role) ? UI_MODE_FULL : UI_MODE_FAMILY
}

export function getUiModeOverride() {
  try {
    return localStorage.getItem(OVERRIDE_KEY)
  } catch (e) {
    return null
  }
}

export function setUiModeOverride(mode) {
  try {
    if (mode) {
      localStorage.setItem(OVERRIDE_KEY, mode)
    } else {
      localStorage.removeItem(OVERRIDE_KEY)
    }
  } catch (e) {
    // ignore
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/familyUiMode.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/uiMode.js test/unit/familyUiMode.test.js
npx --no-install eslint src/family/uiMode.js
git add src/family/uiMode.js test/unit/familyUiMode.test.js
git commit -m "Add family mode UI mode resolution"
```

---

### Task 2: Nachbarschafts-Modell und Kartendaten

**Files:**
- Create: `src/family/neighborhood.js`
- Create: `src/family/personCard.js`
- Test: `test/unit/familyNeighborhood.test.js`
- Test: `test/unit/familyPersonCard.test.js`

**Interfaces:**
- Consumes: `FamilyGraph` aus `src/charts/model/FamilyGraph.js` (`parents(h) → {father, mother}` mit `''` für unbekannt, `partnerFamilies(h) → Family[]`, `children(h) → handle[]`), `getImageUrl(person, size)` aus `src/charts/util.js`.
- Produces:
  - `buildNeighborhood(graph, focusHandle) → Neighborhood`
    ```
    Neighborhood = {
      focus: string,
      parents: {father: string|null, mother: string|null},
      grandparents: {
        paternal: {father: string|null, mother: string|null},
        maternal: {father: string|null, mother: string|null},
      },
      partners: [{familyHandle: string, partner: string|null,
                  children: [{handle: string, childCount: number}]}],
    }
    ```
  - `personCard(person) → {handle, grampsId, name, givenName, years, initials, imageUrl, birth: {date, place}, death: {date, place}}`
  - `yearOf(dateString) → string` (`''` wenn kein Jahr)

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/familyNeighborhood.test.js
import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {buildNeighborhood} from '../../src/family/neighborhood.js'

const ref = handle => ({ref: handle, frel: 'Birth', mrel: 'Birth'})
const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref),
})
const person = (handle, {parents, families = []} = {}) => ({
  handle,
  gramps_id: handle.toUpperCase(),
  extended: {primary_parent_family: parents, families},
})

// Anna (A) is the daughter of Hans (H) and Erna (E). Hans's parents are
// Wilhelm (W) and Frieda (F); Erna's parents are unknown. Anna married Karl (K,
// children P and M) and later Heinz (Z, child T), and has a child L with an
// unknown partner. P has two children.
const fParents = fam('fHE', 'H', 'E', ['A'])
const fGrand = fam('fWF', 'W', 'F', ['H'])
const fK = fam('fAK', 'K', 'A', ['P', 'M'])
const fZ = fam('fAZ', 'Z', 'A', ['T'])
const fSolo = fam('fA', '', 'A', ['L'])
const fP = fam('fP', 'P', '', ['P1', 'P2'])
const graph = new FamilyGraph([
  person('A', {parents: fParents, families: [fK, fZ, fSolo]}),
  person('H', {parents: fGrand, families: [fParents]}),
  person('E', {families: [fParents]}),
  person('W', {families: [fGrand]}),
  person('F', {families: [fGrand]}),
  person('K', {families: [fK]}),
  person('P', {parents: fK, families: [fP]}),
  person('M', {parents: fK}),
  person('T', {parents: fZ}),
  person('L', {parents: fSolo}),
])

describe('buildNeighborhood', () => {
  const n = buildNeighborhood(graph, 'A')

  it('finds parents and grandparents, with null for unknown', () => {
    expect(n.parents).toEqual({father: 'H', mother: 'E'})
    expect(n.grandparents.paternal).toEqual({father: 'W', mother: 'F'})
    expect(n.grandparents.maternal).toEqual({father: null, mother: null})
  })

  it('lists every marriage in order, including an unknown partner', () => {
    expect(n.partners.map(p => p.partner)).toEqual(['K', 'Z', null])
    expect(n.partners.map(p => p.familyHandle)).toEqual(['fAK', 'fAZ', 'fA'])
  })

  it('groups children by family and counts their children', () => {
    expect(n.partners[0].children).toEqual([
      {handle: 'P', childCount: 2},
      {handle: 'M', childCount: 0},
    ])
    expect(n.partners[1].children).toEqual([{handle: 'T', childCount: 0}])
    expect(n.partners[2].children).toEqual([{handle: 'L', childCount: 0}])
  })

  it('handles a person without any relatives', () => {
    const lonely = buildNeighborhood(new FamilyGraph([person('X')]), 'X')
    expect(lonely.parents).toEqual({father: null, mother: null})
    expect(lonely.partners).toEqual([])
  })

  it('skips families in which the person is not a parent', () => {
    const odd = fam('fOdd', 'Q', 'R', ['A'])
    const g = new FamilyGraph([person('A', {families: [odd]})])
    expect(buildNeighborhood(g, 'A').partners).toEqual([])
  })
})
```

```js
// test/unit/familyPersonCard.test.js
import {describe, it, expect} from 'vitest'
import {personCard, yearOf} from '../../src/family/personCard.js'

describe('yearOf', () => {
  it('extracts a four-digit year from any date string', () => {
    expect(yearOf('1932-05-03')).toBe('1932')
    expect(yearOf('3. Mai 1932')).toBe('1932')
    expect(yearOf('um 1900')).toBe('1900')
  })

  it('returns an empty string when there is no year', () => {
    expect(yearOf('')).toBe('')
    expect(yearOf(undefined)).toBe('')
    expect(yearOf('Mai')).toBe('')
  })
})

describe('personCard', () => {
  const anna = {
    handle: 'A',
    gramps_id: 'I1',
    media_list: [],
    profile: {
      name_given: 'Anna',
      name_surname: 'Müller',
      birth: {date: '1932-05-03', place_name: 'Flensburg'},
      death: {date: '2011-02-14', place_name: 'Kiel'},
    },
  }

  it('builds display data from a person profile', () => {
    expect(personCard(anna)).toEqual({
      handle: 'A',
      grampsId: 'I1',
      name: 'Anna Müller',
      givenName: 'Anna',
      years: '1932 – 2011',
      initials: 'AM',
      imageUrl: '',
      birth: {date: '1932-05-03', place: 'Flensburg'},
      death: {date: '2011-02-14', place: 'Kiel'},
    })
  })

  it('shows "* year" for living people and copes with missing data', () => {
    const card = personCard({
      handle: 'B',
      gramps_id: 'I2',
      profile: {name_given: 'Lisa', birth: {date: '1984'}, death: {}},
    })
    expect(card.name).toBe('Lisa')
    expect(card.years).toBe('* 1984')
    expect(card.initials).toBe('L')
    expect(card.death).toEqual({date: '', place: ''})
  })

  it('returns a placeholder for an unknown person', () => {
    const card = personCard(undefined)
    expect(card.name).toBe('')
    expect(card.years).toBe('')
    expect(card.initials).toBe('?')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/familyNeighborhood.test.js test/unit/familyPersonCard.test.js`
Expected: FAIL – imports not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/family/neighborhood.js
// The part of the tree the family canvas shows around one focus person.

const parentsOf = (graph, handle) => {
  const {father, mother} = graph.parents(handle)
  return {father: father || null, mother: mother || null}
}

const noParents = {father: null, mother: null}

export function buildNeighborhood(graph, focusHandle) {
  const parents = parentsOf(graph, focusHandle)
  const partners = graph
    .partnerFamilies(focusHandle)
    .filter(
      family =>
        family.father_handle === focusHandle ||
        family.mother_handle === focusHandle
    )
    .map(family => {
      const partner =
        family.father_handle === focusHandle
          ? family.mother_handle
          : family.father_handle
      return {
        familyHandle: family.handle,
        partner: partner || null,
        children: (family.child_ref_list || []).map(({ref}) => ({
          handle: ref,
          childCount: graph.children(ref).length,
        })),
      }
    })
  return {
    focus: focusHandle,
    parents,
    grandparents: {
      paternal: parents.father ? parentsOf(graph, parents.father) : noParents,
      maternal: parents.mother ? parentsOf(graph, parents.mother) : noParents,
    },
    partners,
  }
}
```

```js
// src/family/personCard.js
// Display data for a person card in the family UI.
import {getImageUrl} from '../charts/util.js'

export function yearOf(date) {
  return `${date ?? ''}`.match(/\d{4}/)?.[0] ?? ''
}

const event = e => ({date: e?.date ?? '', place: e?.place_name ?? ''})

export function personCard(person) {
  const profile = person?.profile ?? {}
  const given = profile.name_given ?? ''
  const surname = profile.name_surname ?? ''
  const born = yearOf(profile.birth?.date)
  const died = yearOf(profile.death?.date)
  let years = ''
  if (born && died) years = `${born} – ${died}`
  else if (died) years = `† ${died}`
  else if (born) years = `* ${born}`
  const initials =
    `${given.charAt(0)}${surname.charAt(0)}`.toUpperCase() || '?'
  return {
    handle: person?.handle ?? '',
    grampsId: person?.gramps_id ?? '',
    name: [given, surname].filter(Boolean).join(' '),
    givenName: given,
    years,
    initials,
    imageUrl: person ? getImageUrl(person, 96) : '',
    birth: event(profile.birth),
    death: event(profile.death),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/familyNeighborhood.test.js test/unit/familyPersonCard.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/neighborhood.js src/family/personCard.js test/unit/familyNeighborhood.test.js test/unit/familyPersonCard.test.js
npx --no-install eslint src/family/neighborhood.js src/family/personCard.js
git add src/family/neighborhood.js src/family/personCard.js test/unit/familyNeighborhood.test.js test/unit/familyPersonCard.test.js
git commit -m "Add family mode neighborhood model and person cards"
```

---

### Task 3: Raster-Layout für beide Ausrichtungen

**Files:**
- Create: `src/family/layout.js`
- Test: `test/unit/familyLayout.test.js`

**Interfaces:**
- Consumes: `Neighborhood` aus Task 2.
- Produces:
  - `ORIENTATION_LTR = 'ltr'`, `ORIENTATION_TTB = 'ttb'`
  - `layoutNeighborhood(model, orientation) → {nodes, edges, width, height}`
    ```
    node = {key: string, kind: 'focus'|'person'|'partner'|'small'|'unknown'|'label',
            handle: string|null, x, y, w, h,
            childCount?: number,       // kind 'person' in the children column
            partner?: string|null}     // kind 'label': whose children follow
    edge = {points: [[x, y], ...]}     // orthogonal polyline
    ```

- [ ] **Step 1: Write the failing test**

```js
// test/unit/familyLayout.test.js
import {describe, it, expect} from 'vitest'
import {
  layoutNeighborhood,
  ORIENTATION_LTR,
  ORIENTATION_TTB,
} from '../../src/family/layout.js'

const full = {
  focus: 'A',
  parents: {father: 'H', mother: 'E'},
  grandparents: {
    paternal: {father: 'W', mother: 'F'},
    maternal: {father: 'O', mother: 'L'},
  },
  partners: [
    {
      familyHandle: 'f1',
      partner: 'K',
      children: [
        {handle: 'P', childCount: 2},
        {handle: 'M', childCount: 0},
      ],
    },
    {familyHandle: 'f2', partner: 'Z', children: [{handle: 'T', childCount: 1}]},
    {familyHandle: 'f3', partner: null, children: [{handle: 'X', childCount: 0}]},
  ],
}

const lonely = {
  focus: 'A',
  parents: {father: null, mother: null},
  grandparents: {
    paternal: {father: null, mother: null},
    maternal: {father: null, mother: null},
  },
  partners: [],
}

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const cards = layout => layout.nodes.filter(n => n.kind !== 'label')
const byHandle = (layout, handle) =>
  layout.nodes.find(n => n.handle === handle && n.kind !== 'label')

describe.each([ORIENTATION_LTR, ORIENTATION_TTB])(
  'layoutNeighborhood (%s)',
  orientation => {
    const layout = layoutNeighborhood(full, orientation)

    it('places every person exactly once', () => {
      const handles = cards(layout).map(n => n.handle)
      for (const h of ['A', 'H', 'E', 'W', 'F', 'O', 'L', 'K', 'Z', 'P', 'M', 'T', 'X']) {
        expect(handles.filter(x => x === h)).toHaveLength(1)
      }
      expect(cards(layout).filter(n => n.kind === 'unknown')).toHaveLength(1)
    })

    it('never overlaps two nodes', () => {
      const all = layout.nodes
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          expect(overlaps(all[i], all[j]), `${all[i].key} / ${all[j].key}`).toBe(false)
        }
      }
    })

    it('keeps everything inside the reported size', () => {
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0)
        expect(n.y).toBeGreaterThanOrEqual(0)
        expect(n.x + n.w).toBeLessThanOrEqual(layout.width)
        expect(n.y + n.h).toBeLessThanOrEqual(layout.height)
      }
    })

    it('orders generations along the orientation axis', () => {
      const axis = orientation === ORIENTATION_LTR ? 'x' : 'y'
      const g = h => byHandle(layout, h)[axis]
      expect(g('W')).toBeLessThan(g('H'))
      expect(g('H')).toBeLessThan(g('A'))
      expect(g('A')).toBeLessThan(g('P'))
      expect(byHandle(layout, 'K')[axis]).toBe(g('A'))
    })

    it('labels each child group with its partner', () => {
      const labels = layout.nodes.filter(n => n.kind === 'label')
      expect(labels.map(n => n.partner)).toEqual(['K', 'Z', null])
    })

    it('connects every relative with a line', () => {
      // 4 grandparents + 2 parents + 1 partner line + 4 children
      expect(layout.edges).toHaveLength(11)
      for (const e of layout.edges) {
        expect(e.points.length).toBeGreaterThanOrEqual(2)
      }
    })

    it('lays out a person without relatives', () => {
      const alone = layoutNeighborhood(lonely, orientation)
      expect(alone.nodes).toHaveLength(1)
      expect(alone.nodes[0].kind).toBe('focus')
      expect(alone.edges).toHaveLength(0)
    })
  }
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/familyLayout.test.js`
Expected: FAIL – import not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/family/layout.js
// Grid layout of a family neighbourhood. Positions are computed along a
// generation axis (g) and a sibling axis (s) and mapped to x/y at the end,
// so both orientations share one algorithm.

export const ORIENTATION_LTR = 'ltr'
export const ORIENTATION_TTB = 'ttb'

const CARD = {w: 184, h: 60}
const SMALL = {w: 144, h: 44}
const PAD = 32
const SIB_GAP = 16
const GROUP_GAP = 28
const LABEL_EXT = 24

export function layoutNeighborhood(model, orientation = ORIENTATION_LTR) {
  const ltr = orientation !== ORIENTATION_TTB
  const ext = box => (ltr ? box.h : box.w) // size along s
  const len = box => (ltr ? box.w : box.h) // size along g
  const genGap = ltr ? 64 : 56
  const colLen = [len(SMALL), len(CARD), len(CARD), len(CARD)]
  const colStart = [0]
  for (let i = 1; i < colLen.length; i += 1) {
    colStart[i] = colStart[i - 1] + colLen[i - 1] + genGap
  }

  const items = []
  const lines = []
  const place = (key, col, center, box, extra = {}) => {
    const item = {
      key,
      g: colStart[col],
      s: center - ext(box) / 2,
      gl: len(box),
      sl: ext(box),
      ...extra,
    }
    items.push(item)
    return item
  }
  const mid = item => item.s + item.sl / 2
  const near = item => ({g: item.g, s: mid(item)})
  const far = item => ({g: item.g + item.gl, s: mid(item)})
  const elbow = (a, b) => {
    const m = (a.g + b.g) / 2
    lines.push([a, {g: m, s: a.s}, {g: m, s: b.s}, b])
  }

  // focus column: the focus person, then every partner below
  const focus = place('focus', 2, ext(CARD) / 2, CARD, {
    kind: 'focus',
    handle: model.focus,
  })
  const partnerItems = model.partners.map((p, i) => {
    const center = ext(CARD) / 2 + (i + 1) * (ext(CARD) + SIB_GAP)
    return p.partner
      ? place(`partner-${p.familyHandle}`, 2, center, CARD, {
          kind: 'partner',
          handle: p.partner,
        })
      : place(`unknown-${p.familyHandle}`, 2, center, CARD, {
          kind: 'unknown',
          handle: null,
        })
  })
  const lastPartner = partnerItems.filter(Boolean).at(-1)
  if (lastPartner) {
    const g = focus.g + focus.gl / 2
    lines.push([
      {g, s: focus.s + focus.sl},
      {g, s: lastPartner.s},
    ])
  }

  // children column, grouped by family, centred on the focus column
  const groups = model.partners
    .map((p, i) => ({p, origin: partnerItems[i] ?? focus}))
    .filter(({p}) => p.children.length)
  const labelExt = ltr ? LABEL_EXT : 0
  const groupExt = ({p}) =>
    labelExt + p.children.length * (ext(CARD) + SIB_GAP) - SIB_GAP
  const blockExt =
    groups.reduce((sum, grp) => sum + groupExt(grp), 0) +
    Math.max(groups.length - 1, 0) * GROUP_GAP
  const columnTop = focus.s
  const columnBottom = (lastPartner ?? focus).s + (lastPartner ?? focus).sl
  let cursor = (columnTop + columnBottom) / 2 - blockExt / 2
  for (const grp of groups) {
    const labelS = cursor
    items.push({
      key: `label-${grp.p.familyHandle}`,
      kind: 'label',
      handle: null,
      partner: grp.p.partner,
      g: ltr ? colStart[3] : colStart[3] - 22,
      s: labelS,
      gl: ltr ? len(CARD) : 18,
      sl: ltr ? LABEL_EXT - 4 : groupExt(grp),
    })
    cursor += labelExt
    for (const child of grp.p.children) {
      const item = place(
        `child-${child.handle}`,
        3,
        cursor + ext(CARD) / 2,
        CARD,
        {kind: 'person', handle: child.handle, childCount: child.childCount}
      )
      elbow(far(grp.origin), near(item))
      cursor += ext(CARD) + SIB_GAP
    }
    cursor += GROUP_GAP - SIB_GAP
  }

  // parents, spaced so that both grandparent pairs fit
  const fc = mid(focus)
  const pairExt = 2 * ext(SMALL) + SIB_GAP
  const parentDist = Math.max(ext(CARD), pairExt) + SIB_GAP
  const sides = [
    ['father', fc - parentDist / 2, 'paternal'],
    ['mother', fc + parentDist / 2, 'maternal'],
  ]
  for (const [role, center, side] of sides) {
    const handle = model.parents[role]
    if (!handle) continue
    const parent = place(`parent-${role}`, 1, center, CARD, {
      kind: 'person',
      handle,
    })
    elbow(far(parent), near(focus))
    const gp = model.grandparents[side]
    const offset = (ext(SMALL) + SIB_GAP) / 2
    for (const [gpRole, gpCenter] of [
      ['father', center - offset],
      ['mother', center + offset],
    ]) {
      if (!gp[gpRole]) continue
      const item = place(`gp-${side}-${gpRole}`, 0, gpCenter, SMALL, {
        kind: 'small',
        handle: gp[gpRole],
      })
      elbow(far(item), near(parent))
    }
  }

  // drop empty leading generation columns and shift into positive space
  const minG = Math.min(...items.map(i => i.g))
  const minS = Math.min(...items.map(i => i.s))
  const toXY = ({g, s}) =>
    ltr ? [g - minG + PAD, s - minS + PAD] : [s - minS + PAD, g - minG + PAD]
  const nodes = items.map(({g, s, gl, sl, ...rest}) => {
    const [x, y] = toXY({g, s})
    return {...rest, x, y, w: ltr ? gl : sl, h: ltr ? sl : gl}
  })
  const edges = lines.map(points => ({points: points.map(toXY)}))
  const width = Math.max(...nodes.map(n => n.x + n.w)) + PAD
  const height = Math.max(...nodes.map(n => n.y + n.h)) + PAD
  return {nodes, edges, width, height}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/familyLayout.test.js`
Expected: PASS (14 tests, 7 per orientation). Falls „never overlaps“ für die Beschriftungen in `ttb` fehlschlägt: Beschriftung liegt 22 px vor der Kinderspalte, `genGap` (56) muss größer als 22 + 18 sein – Werte nicht verkleinern.

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/layout.js test/unit/familyLayout.test.js
npx --no-install eslint src/family/layout.js
git add src/family/layout.js test/unit/familyLayout.test.js
git commit -m "Add family mode grid layout for both orientations"
```

---

### Task 4: Daten laden

**Files:**
- Create: `src/family/familyApi.js`
- Test: `test/unit/familyApi.test.js`

**Interfaces:**
- Consumes: `appState.apiGet(url) → Promise<{data} | {error}>`, `FamilyGraph`.
- Produces:
  - `neighborhoodUrl(grampsId, locale) → string`
  - `fetchNeighborhoodGraph(apiGet, grampsId, locale) → Promise<{graph: FamilyGraph, focus: string} | {error: string}>`
  - `fetchGrampsId(apiGet, handle) → Promise<string>` (`''` bei Fehler)
  - `searchPeopleUrl(query, locale) → string`

- [ ] **Step 1: Write the failing test**

```js
// test/unit/familyApi.test.js
import {describe, it, expect} from 'vitest'
import {
  neighborhoodUrl,
  fetchNeighborhoodGraph,
  fetchGrampsId,
  searchPeopleUrl,
} from '../../src/family/familyApi.js'

const decodeRules = url =>
  JSON.parse(decodeURIComponent(url.match(/rules=([^&]+)/)[1]))

describe('neighborhoodUrl', () => {
  it('asks for three generations up and down', () => {
    const url = neighborhoodUrl('I1', 'de')
    expect(url.startsWith('/api/people/?')).toBe(true)
    expect(decodeRules(url)).toEqual({
      function: 'or',
      rules: [
        {name: 'IsLessThanNthGenerationAncestorOf', values: ['I1', 3]},
        {name: 'IsLessThanNthGenerationDescendantOf', values: ['I1', 3]},
      ],
    })
    expect(url).toContain('locale=de')
    expect(url).toContain('profile=self')
    expect(url).toContain(
      'extend=primary_parent_family,family_list,parent_family_list'
    )
  })
})

describe('fetchNeighborhoodGraph', () => {
  const anna = {
    handle: 'A',
    gramps_id: 'I1',
    extended: {
      families: [
        {handle: 'f1', father_handle: 'K', mother_handle: 'A', child_ref_list: []},
      ],
    },
  }

  it('loads partners that the rules did not return', async () => {
    const calls = []
    const apiGet = async url => {
      calls.push(url)
      if (url.includes('rules=')) return {data: [anna]}
      return {data: [{handle: 'K', gramps_id: 'I2', profile: {name_given: 'Karl'}}]}
    }
    const res = await fetchNeighborhoodGraph(apiGet, 'I1', 'de')
    expect(res.focus).toBe('A')
    expect(res.graph.person('K').profile.name_given).toBe('Karl')
    expect(calls[1]).toContain('handles=K')
  })

  it('does not make a second request when all partners are known', async () => {
    let count = 0
    const karl = {handle: 'K', gramps_id: 'I2'}
    const apiGet = async () => {
      count += 1
      return {data: [anna, karl]}
    }
    await fetchNeighborhoodGraph(apiGet, 'I1', 'de')
    expect(count).toBe(1)
  })

  it('reports an unknown Gramps ID', async () => {
    const res = await fetchNeighborhoodGraph(async () => ({data: []}), 'I9', 'de')
    expect(res.error).toBeTruthy()
  })

  it('passes API errors through', async () => {
    const res = await fetchNeighborhoodGraph(async () => ({error: 'boom'}), 'I1', 'de')
    expect(res).toEqual({error: 'boom'})
  })
})

describe('fetchGrampsId', () => {
  it('returns the Gramps ID of a handle, or an empty string', async () => {
    expect(await fetchGrampsId(async () => ({data: {gramps_id: 'I7'}}), 'h')).toBe('I7')
    expect(await fetchGrampsId(async () => ({error: 'x'}), 'h')).toBe('')
  })
})

describe('searchPeopleUrl', () => {
  it('searches people with a prefix query', () => {
    const url = searchPeopleUrl('Mül', 'de')
    expect(url).toContain('query=M%C3%BCl*')
    expect(url).toContain('type=person')
    expect(url).toContain('pagesize=8')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/familyApi.test.js`
Expected: FAIL – import not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/family/familyApi.js
// Requests used by the family UI.
import {FamilyGraph} from '../charts/model/FamilyGraph.js'

const EXTEND = 'primary_parent_family,family_list,parent_family_list'

export function neighborhoodUrl(grampsId, locale) {
  const rules = {
    function: 'or',
    rules: [
      {name: 'IsLessThanNthGenerationAncestorOf', values: [grampsId, 3]},
      {name: 'IsLessThanNthGenerationDescendantOf', values: [grampsId, 3]},
    ],
  }
  return `/api/people/?rules=${encodeURIComponent(
    JSON.stringify(rules)
  )}&locale=${locale}&profile=self&extend=${EXTEND}`
}

export async function fetchNeighborhoodGraph(apiGet, grampsId, locale) {
  const res = await apiGet(neighborhoodUrl(grampsId, locale))
  if ('error' in res) return {error: res.error}
  let people = res.data ?? []
  const focus = people.find(p => p.gramps_id === grampsId)
  if (!focus) return {error: `Person ${grampsId} not found`}
  const known = new Set(people.map(p => p.handle))
  const missing = (focus.extended?.families ?? [])
    .flatMap(f => [f.father_handle, f.mother_handle])
    .filter(h => h && !known.has(h))
  if (missing.length) {
    const partners = await apiGet(
      `/api/people/?handles=${missing.join(
        ','
      )}&locale=${locale}&profile=self&extend=${EXTEND}`
    )
    if (!('error' in partners)) people = [...people, ...(partners.data ?? [])]
  }
  return {graph: new FamilyGraph(people), focus: focus.handle}
}

export async function fetchGrampsId(apiGet, handle) {
  const res = await apiGet(`/api/people/${handle}?keys=gramps_id`)
  return 'error' in res ? '' : res.data?.gramps_id ?? ''
}

export function searchPeopleUrl(query, locale) {
  return `/api/search/?query=${encodeURIComponent(
    `${query}*`
  )}&type=person&profile=self&locale=${locale}&page=1&pagesize=8`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/familyApi.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/familyApi.js test/unit/familyApi.test.js
npx --no-install eslint src/family/familyApi.js
git add src/family/familyApi.js test/unit/familyApi.test.js
git commit -m "Add family mode data loading"
```

---

### Task 5: Schriften und Stile

**Files:**
- Create: `fonts/atkinson-hyperlegible-400.woff2`, `fonts/atkinson-hyperlegible-700.woff2`, `fonts/literata-400.woff2`, `fonts/literata-600.woff2`
- Modify: `fonts/fonts.css` (am Ende anfügen)
- Create: `src/family/familyStyles.js`

**Interfaces:**
- Produces: `familyStyles` (Lit `css`), CSS-Variablen `--fm-paper, --fm-ink, --fm-moss, --fm-muted, --fm-line, --fm-leaf, --fm-add, --fm-add-tint, --fm-card, --fm-font-ui, --fm-font-name`.

- [ ] **Step 1: Schriften herunterladen**

```bash
base=https://cdn.jsdelivr.net/npm
curl -fsSL -o fonts/atkinson-hyperlegible-400.woff2 $base/@fontsource/atkinson-hyperlegible@5/files/atkinson-hyperlegible-latin-400-normal.woff2
curl -fsSL -o fonts/atkinson-hyperlegible-700.woff2 $base/@fontsource/atkinson-hyperlegible@5/files/atkinson-hyperlegible-latin-700-normal.woff2
curl -fsSL -o fonts/literata-400.woff2 $base/@fontsource/literata@5/files/literata-latin-400-normal.woff2
curl -fsSL -o fonts/literata-600.woff2 $base/@fontsource/literata@5/files/literata-latin-600-normal.woff2
file fonts/atkinson-*.woff2 fonts/literata-*.woff2
```
Expected: viermal `Web Open Font Format (Version 2)`. Beide Schriften stehen unter der SIL Open Font License; die Latin-Teilmenge enthält Umlaute und ß.

- [ ] **Step 2: `@font-face` ergänzen** – am Ende von `fonts/fonts.css`:

```css
@font-face {
  font-family: 'Atkinson Hyperlegible';
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/atkinson-hyperlegible-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Atkinson Hyperlegible';
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/atkinson-hyperlegible-700.woff2') format('woff2');
}
@font-face {
  font-family: 'Literata';
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/literata-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Literata';
  font-weight: 600;
  font-display: swap;
  src: url('../fonts/literata-600.woff2') format('woff2');
}
```

- [ ] **Step 3: Stile anlegen**

```js
// src/family/familyStyles.js
import {css} from 'lit'

export const familyStyles = css`
  :host {
    --fm-paper: #f7f8f5;
    --fm-canvas: #f4f6f2;
    --fm-dot: #cdd6ce;
    --fm-ink: #1e2b24;
    --fm-moss: #3e6a50;
    --fm-muted: #5f6f65;
    --fm-line: #a9baae;
    --fm-leaf: #e3ece5;
    --fm-border: #d6dfd8;
    --fm-card: #ffffff;
    --fm-add: #a8661a;
    --fm-add-tint: #f6ead9;
    --fm-focus-ring: #2f6fdb;
    --fm-font-ui: 'Atkinson Hyperlegible', system-ui, sans-serif;
    --fm-font-name: 'Literata', Georgia, serif;
    font-family: var(--fm-font-ui);
    font-size: 17px;
    line-height: 1.5;
    color: var(--fm-ink);
  }

  @media (prefers-color-scheme: dark) {
    :host(:not([data-theme='light'])) {
      --fm-paper: #151b18;
      --fm-canvas: #121714;
      --fm-dot: #2a332e;
      --fm-ink: #e6ede8;
      --fm-moss: #9cc7aa;
      --fm-muted: #a6b4ab;
      --fm-line: #4d5d53;
      --fm-leaf: #24302a;
      --fm-border: #33403a;
      --fm-card: #1c2420;
      --fm-add: #e0a35a;
      --fm-add-tint: #3a2c1c;
    }
  }

  button {
    font: inherit;
    color: inherit;
  }

  :focus-visible {
    outline: 3px solid var(--fm-focus-ring);
    outline-offset: 2px;
  }

  .float {
    background: var(--fm-card);
    box-shadow: 0 6px 18px -8px rgba(20, 40, 30, 0.4);
    border: none;
  }

  .pill {
    min-height: 44px;
    border-radius: 999px;
    padding: 0 16px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }
`
```

- [ ] **Step 4: Prüfen und committen**

Run: `npm run build 2>&1 | tail -2`
Expected: `created dist in …`; `ls dist/fonts | grep -c -E 'atkinson|literata'` gibt `4`.

```bash
npx --no-install prettier --write src/family/familyStyles.js fonts/fonts.css
git add fonts/atkinson-hyperlegible-400.woff2 fonts/atkinson-hyperlegible-700.woff2 fonts/literata-400.woff2 fonts/literata-600.woff2 fonts/fonts.css src/family/familyStyles.js
git commit -m "Add family mode fonts and design tokens"
```

---

### Task 6: Leinwand-Komponente

**Files:**
- Create: `src/family/GrampsjsFamilyCanvas.js`

**Interfaces:**
- Consumes: `layout` aus Task 3, `personCard` aus Task 2, `familyStyles` aus Task 5.
- Produces: `<grampsjs-family-canvas .layout .cards .selected .appState>`
  - `cards`: `Map<handle, PersonCard>`
  - feuert `family:select` mit `{handle}` (bubbles, composed) beim Antippen einer Karte
  - öffentliche Methoden `zoomBy(factor)`, `centerOn(handle)`

Komponenten-Tests sind laut `AGENTS.md` nicht vorgesehen; geprüft wird in Task 9 per Playwright-Screenshot.

- [ ] **Step 1: Komponente schreiben**

```js
// src/family/GrampsjsFamilyCanvas.js
// Pannable, zoomable canvas showing a laid-out family neighbourhood.
import {html, css, svg, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'

const MIN_SCALE = 0.4
const MAX_SCALE = 2
const DRAG_THRESHOLD = 5

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

class GrampsjsFamilyCanvas extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          position: relative;
          overflow: hidden;
          touch-action: none;
          background-color: var(--fm-canvas);
          background-image: radial-gradient(
            var(--fm-dot) 1.2px,
            transparent 1.2px
          );
          background-size: 22px 22px;
          cursor: grab;
        }
        :host([dragging]) {
          cursor: grabbing;
        }
        .stage {
          position: absolute;
          left: 0;
          top: 0;
          transform-origin: 0 0;
        }
        .stage.animate {
          transition: transform 0.35s ease;
        }
        svg {
          position: absolute;
          left: 0;
          top: 0;
          overflow: visible;
        }
        .card {
          position: absolute;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          background: var(--fm-card);
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          text-align: left;
          cursor: pointer;
        }
        .card:hover {
          border-color: var(--fm-moss);
        }
        .card.small {
          border-radius: 11px;
          padding: 0 10px;
          gap: 8px;
        }
        .card.focus {
          background: var(--fm-ink);
          border-color: var(--fm-ink);
          color: var(--fm-paper);
          box-shadow: 0 0 0 6px rgba(30, 43, 36, 0.12);
        }
        .card.unknown {
          border-style: dashed;
          color: var(--fm-muted);
          cursor: default;
        }
        .face {
          flex: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 700;
          font-size: 13px;
          background: var(--fm-leaf);
          color: var(--fm-moss);
          background-size: cover;
          background-position: center;
        }
        .small .face {
          width: 26px;
          height: 26px;
          font-size: 11px;
        }
        .focus .face {
          background-color: #2f4a3b;
          color: #cfe3d5;
        }
        .text {
          min-width: 0;
        }
        .name {
          display: block;
          font-family: var(--fm-font-name);
          font-size: 16px;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .small .name {
          font-size: 14px;
        }
        .sub {
          display: block;
          font-size: 13px;
          color: var(--fm-muted);
          white-space: nowrap;
        }
        .focus .sub {
          color: #cfe3d5;
        }
        .label {
          position: absolute;
          font-size: 13px;
          font-weight: 700;
          color: var(--fm-muted);
          white-space: nowrap;
        }
      `,
    ]
  }

  static get properties() {
    return {
      layout: {type: Object},
      cards: {type: Object},
      selected: {type: String},
      dragging: {type: Boolean, reflect: true},
      _tx: {state: true},
      _ty: {state: true},
      _scale: {state: true},
      _animate: {state: true},
    }
  }

  constructor() {
    super()
    this.layout = {nodes: [], edges: [], width: 0, height: 0}
    this.cards = new Map()
    this.selected = ''
    this.dragging = false
    this._tx = 0
    this._ty = 0
    this._scale = 1
    this._animate = false
    this._pointers = new Map()
    this._moved = 0
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('pointermove', this._onPointerMove)
    this.addEventListener('pointerup', this._onPointerUp)
    this.addEventListener('pointercancel', this._onPointerUp)
    this.addEventListener('wheel', this._onWheel, {passive: false})
  }

  updated(changed) {
    if (changed.has('layout')) {
      this.centerOn(this.selected)
    }
  }

  // Moves the canvas so that the card of `handle` is in the middle
  centerOn(handle) {
    const node = this.layout.nodes.find(
      n => n.handle === handle && n.kind !== 'label'
    )
    if (!node) return
    const {width, height} = this.getBoundingClientRect()
    this._animate = !reducedMotion()
    this._tx = width / 2 - (node.x + node.w / 2) * this._scale
    this._ty = height / 2 - (node.y + node.h / 2) * this._scale
  }

  zoomBy(factor, cx, cy) {
    const rect = this.getBoundingClientRect()
    const x = cx ?? rect.width / 2
    const y = cy ?? rect.height / 2
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._scale * factor))
    const k = scale / this._scale
    this._animate = false
    this._tx = x - (x - this._tx) * k
    this._ty = y - (y - this._ty) * k
    this._scale = scale
  }

  _onPointerDown(e) {
    this._pointers.set(e.pointerId, {x: e.clientX, y: e.clientY})
    this._moved = 0
  }

  _onPointerMove(e) {
    const prev = this._pointers.get(e.pointerId)
    if (!prev) return
    const next = {x: e.clientX, y: e.clientY}
    if (this._pointers.size === 2) {
      const [other] = [...this._pointers].filter(([id]) => id !== e.pointerId)
      const o = other[1]
      const before = Math.hypot(prev.x - o.x, prev.y - o.y)
      const after = Math.hypot(next.x - o.x, next.y - o.y)
      const rect = this.getBoundingClientRect()
      if (before > 0) {
        this.zoomBy(
          after / before,
          (next.x + o.x) / 2 - rect.left,
          (next.y + o.y) / 2 - rect.top
        )
      }
    } else {
      this._animate = false
      this._tx += next.x - prev.x
      this._ty += next.y - prev.y
    }
    this._moved += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y)
    if (this._moved > DRAG_THRESHOLD && !this.dragging) {
      // capture only once it is a drag, so taps still click the card
      this.dragging = true
      this.setPointerCapture(e.pointerId)
    }
    this._pointers.set(e.pointerId, next)
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId)
    if (!this._pointers.size) this.dragging = false
  }

  _onWheel(e) {
    e.preventDefault()
    const rect = this.getBoundingClientRect()
    this.zoomBy(
      e.deltaY < 0 ? 1.1 : 1 / 1.1,
      e.clientX - rect.left,
      e.clientY - rect.top
    )
  }

  _select(handle) {
    // a drag that ends on a card is not a tap
    if (this._moved > DRAG_THRESHOLD || !handle) return
    fireEvent(this, 'family:select', {handle})
  }

  _subtitle(node, card) {
    if (node.kind === 'person' && node.childCount) {
      return node.childCount === 1
        ? this._('1 child')
        : this._('%s children', node.childCount)
    }
    return card?.years ?? ''
  }

  _renderLabel(node) {
    const partner = node.partner ? this.cards.get(node.partner) : null
    const text = partner
      ? this._('with %s', partner.givenName || partner.name)
      : this._('Children')
    return html`<div
      class="label"
      style="left:${node.x}px;top:${node.y}px;width:${node.w}px"
    >
      ${text}
    </div>`
  }

  _renderCard(node) {
    if (node.kind === 'label') return this._renderLabel(node)
    const card = node.handle ? this.cards.get(node.handle) : null
    const kind =
      node.handle === this.selected && node.kind !== 'small'
        ? 'focus'
        : node.kind
    const face = card?.imageUrl
      ? html`<span
          class="face"
          style="background-image:url('${card.imageUrl}')"
        ></span>`
      : html`<span class="face">${card?.initials ?? '?'}</span>`
    const name = node.kind === 'unknown' ? this._('Unknown') : card?.name
    return html`<button
      class="card ${kind}"
      style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px"
      ?disabled="${node.kind === 'unknown'}"
      aria-current="${node.handle === this.selected ? 'true' : 'false'}"
      @click="${() => this._select(node.handle)}"
    >
      ${face}
      <span class="text">
        <span class="name">${name}</span>
        ${node.kind === 'small'
          ? ''
          : html`<span class="sub">${this._subtitle(node, card)}</span>`}
      </span>
    </button>`
  }

  render() {
    const {nodes, edges, width, height} = this.layout
    return html`<div
      class="stage ${this._animate ? 'animate' : ''}"
      style="width:${width}px;height:${height}px;transform:translate(${this
        ._tx}px, ${this._ty}px) scale(${this._scale})"
    >
      <svg width="${width}" height="${height}" aria-hidden="true">
        ${edges.map(
          e => svg`<polyline
            points="${e.points.map(p => p.join(',')).join(' ')}"
            fill="none" stroke="var(--fm-line)" stroke-width="2"
            stroke-linejoin="round"></polyline>`
        )}
      </svg>
      ${nodes.map(node => this._renderCard(node))}
    </div>`
  }
}

window.customElements.define('grampsjs-family-canvas', GrampsjsFamilyCanvas)
```

- [ ] **Step 2: Lint und Build**

Run: `npx --no-install prettier --write src/family/GrampsjsFamilyCanvas.js && npx --no-install eslint src/family/GrampsjsFamilyCanvas.js && npm run build 2>&1 | tail -1`
Expected: keine ESLint-Fehler, `created dist in …`

- [ ] **Step 3: Commit**

```bash
git add src/family/GrampsjsFamilyCanvas.js
git commit -m "Add family mode tree canvas"
```

---

### Task 7: Details, App-Rahmen und Einbindung

**Files:**
- Create: `src/family/GrampsjsFamilyDetails.js`
- Create: `src/family/GrampsjsFamilyApp.js`
- Modify: `src/GrampsJs.js` – Import, `_setReady()` (nach `this._loadTreeConfig()`), `renderContent()` (nach der Sprach-/Strings-Logik direkt vor `return html\`<mwc-drawer`), `connectedCallback()` (Listener)
- Modify: `src/components/GrampsjsSettingsMenu.js` – Menüpunkt „Familien-Modus ansehen“
- Modify: `lang/en.json`, `lang/de.json`

**Interfaces:**
- Consumes: alles aus Task 1–6; `appState.user` (neu, siehe unten), `appState.treeConfig`, `appState.settings.homePerson`, `appState.signout()`.
- Produces:
  - `appState.user`: `undefined` (lädt), `null` (Fehler) oder `{name, full_name, role, …}` aus `GET /api/users/-/`
  - Window-Event `uimode:changed` → `GrampsJs` rendert neu
  - Route im Familien-Modus: `/` = „Du“ im Fokus, `/person/<gramps_id>` = diese Person

- [ ] **Step 1: Details-Komponente**

```js
// src/family/GrampsjsFamilyDetails.js
// Details of the selected person: side panel on wide screens, bottom sheet
// on narrow ones.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'

class GrampsjsFamilyDetails extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          background: var(--fm-card);
          box-sizing: border-box;
        }
        .grip {
          display: none;
        }
        h2 {
          margin: 0;
          font-family: var(--fm-font-name);
          font-weight: 600;
          font-size: 26px;
          line-height: 1.15;
        }
        .years {
          color: var(--fm-muted);
          margin: 2px 0 16px;
        }
        dl {
          margin: 0;
        }
        dl div {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 8px;
          padding: 8px 0;
          border-top: 1px solid var(--fm-leaf);
          font-size: 15px;
        }
        dt {
          color: var(--fm-muted);
        }
        dd {
          margin: 0;
        }
        @media (max-width: 991px) {
          :host {
            border-radius: 22px 22px 0 0;
            box-shadow: 0 -10px 30px -12px rgba(20, 40, 30, 0.35);
            padding: 8px 18px 18px;
          }
          .grip {
            display: block;
            width: 100%;
            min-height: 24px;
            border: none;
            background: none;
            cursor: pointer;
          }
          .grip::before {
            content: '';
            display: block;
            width: 44px;
            height: 5px;
            border-radius: 3px;
            background: var(--fm-border);
            margin: 0 auto;
          }
          h2 {
            font-size: 22px;
          }
          :host(:not([expanded])) dl {
            display: none;
          }
          :host(:not([expanded])) .years {
            margin-bottom: 0;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      card: {type: Object},
      relatives: {type: Object},
      expanded: {type: Boolean, reflect: true},
    }
  }

  constructor() {
    super()
    this.card = null
    this.relatives = {parents: [], partners: [], children: 0}
    this.expanded = false
  }

  _line(label, value) {
    return value ? html`<div><dt>${label}</dt><dd>${value}</dd></div>` : ''
  }

  _event(e) {
    return [e?.date, e?.place].filter(Boolean).join(', ')
  }

  render() {
    if (!this.card) return ''
    const {parents, partners, children} = this.relatives
    return html`
      <button
        class="grip"
        aria-label="${this.expanded ? this._('Less') : this._('More')}"
        @click="${() => {
          this.expanded = !this.expanded
        }}"
      ></button>
      <h2>${this.card.name}</h2>
      <div class="years">${this.card.years}</div>
      <dl>
        ${this._line(this._('Born'), this._event(this.card.birth))}
        ${this._line(this._('Died'), this._event(this.card.death))}
        ${this._line(this._('Parents'), parents.join(', '))}
        ${this._line(this._('Partners'), partners.join(', '))}
        ${this._line(this._('Children'), children ? `${children}` : '')}
      </dl>
    `
  }
}

window.customElements.define('grampsjs-family-details', GrampsjsFamilyDetails)
```

- [ ] **Step 2: App-Rahmen**

```js
// src/family/GrampsjsFamilyApp.js
// Shell of the family UI: canvas, floating controls and details.
import {html, css, LitElement} from 'lit'
import {
  mdiMagnify,
  mdiAccountCircle,
  mdiPlus,
  mdiMinus,
  mdiSitemapOutline,
} from '@mdi/js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import '../components/GrampsjsIcon.js'
import {familyStyles} from './familyStyles.js'
import {buildNeighborhood} from './neighborhood.js'
import {layoutNeighborhood, ORIENTATION_LTR, ORIENTATION_TTB} from './layout.js'
import {personCard} from './personCard.js'
import {
  fetchNeighborhoodGraph,
  fetchGrampsId,
  searchPeopleUrl,
} from './familyApi.js'
import {
  canSwitchUiMode,
  setUiModeOverride,
  UI_MODE_FULL,
  TREE_CONFIG_USER_PERSONS,
} from './uiMode.js'
import './GrampsjsFamilyCanvas.js'
import './GrampsjsFamilyDetails.js'

const ORIENTATION_KEY = 'grampsjs_family_orientation'


function readOrientation() {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === ORIENTATION_TTB
      ? ORIENTATION_TTB
      : ORIENTATION_LTR
  } catch (e) {
    return ORIENTATION_LTR
  }
}

class GrampsjsFamilyApp extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: grid;
          grid-template-columns: 1fr 340px;
          height: 100vh;
          height: 100dvh;
          background: var(--fm-paper);
        }
        .main {
          position: relative;
          min-width: 0;
        }
        grampsjs-family-canvas {
          position: absolute;
          inset: 0;
        }
        grampsjs-family-details {
          border-left: 1px solid var(--fm-leaf);
          padding: 24px;
          overflow-y: auto;
        }
        .top {
          position: absolute;
          top: 16px;
          left: 16px;
          right: 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          pointer-events: none;
        }
        .top > * {
          pointer-events: auto;
        }
        .search {
          position: relative;
          flex: 1;
          max-width: 420px;
          margin: 0 auto;
        }
        .search label {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 46px;
          border-radius: 999px;
          padding: 0 16px;
        }
        .search input {
          flex: 1;
          min-width: 0;
          border: none;
          background: none;
          font: inherit;
          font-size: 16px;
          color: var(--fm-ink);
          outline: none;
        }
        .results {
          position: absolute;
          left: 0;
          right: 0;
          top: 52px;
          margin: 0;
          padding: 6px;
          list-style: none;
          border-radius: 16px;
        }
        .results button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 10px;
          padding: 6px 10px;
          cursor: pointer;
        }
        .results button:hover {
          background: var(--fm-leaf);
        }
        .results small {
          display: block;
          color: var(--fm-muted);
        }
        .seg {
          display: flex;
          gap: 2px;
          padding: 3px;
          border-radius: 12px;
        }
        .seg button,
        .icon-btn {
          width: 44px;
          height: 40px;
          display: grid;
          place-items: center;
          border: none;
          border-radius: 9px;
          background: none;
          cursor: pointer;
        }
        .seg button[aria-pressed='true'] {
          background: var(--fm-ink);
          color: var(--fm-paper);
        }
        .account {
          position: relative;
        }
        .menu {
          position: absolute;
          right: 0;
          top: 50px;
          min-width: 220px;
          border-radius: 14px;
          padding: 6px;
        }
        .menu button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 10px;
          padding: 0 12px;
          cursor: pointer;
        }
        .menu button:hover {
          background: var(--fm-leaf);
        }
        .zoom {
          position: absolute;
          right: 16px;
          bottom: 16px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
        }
        .empty {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 24px;
          color: var(--fm-muted);
        }
        @media (max-width: 991px) {
          :host {
            grid-template-columns: 1fr;
          }
          grampsjs-family-details {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            max-height: 70vh;
            border-left: none;
            z-index: 2;
          }
          .zoom {
            display: none;
          }
          .top {
            flex-wrap: wrap;
            top: 12px;
            left: 12px;
            right: 12px;
          }
          .search {
            order: -1;
            flex-basis: 100%;
            max-width: none;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      _graph: {state: true},
      _focus: {state: true},
      _orientation: {state: true},
      _query: {state: true},
      _results: {state: true},
      _menuOpen: {state: true},
      _error: {state: true},
      _noStart: {state: true},
    }
  }

  constructor() {
    super()
    this._graph = null
    this._focus = ''
    this._orientation = readOrientation()
    this._query = ''
    this._results = []
    this._menuOpen = false
    this._error = ''
    this._noStart = false
    this._loadedId = null
    this._searchTimer = null
  }

  get _locale() {
    return this.appState.settings?.lang || 'en'
  }

  updated(changed) {
    if (changed.has('appState')) {
      this._loadForPath()
    }
  }

  async _myGrampsId() {
    const username = this.appState.user?.name
    const handle = this.appState.treeConfig?.[TREE_CONFIG_USER_PERSONS]?.[
      username
    ]
    if (handle) {
      const id = await fetchGrampsId(this.appState.apiGet, handle)
      if (id) return id
    }
    return this.appState.settings?.homePerson || ''
  }

  async _loadForPath() {
    const {page, pageId} = this.appState.path
    const grampsId = page === 'person' && pageId ? pageId : await this._myGrampsId()
    if (!grampsId) {
      this._noStart = true
      return
    }
    if (grampsId === this._loadedId) return
    this._loadedId = grampsId
    this._noStart = false
    const res = await fetchNeighborhoodGraph(
      this.appState.apiGet,
      grampsId,
      this._locale
    )
    if ('error' in res) {
      this._error = res.error
      fireEvent(this, 'grampsjs:error', {message: res.error})
      return
    }
    this._error = ''
    this._graph = res.graph
    this._focus = res.focus
  }

  _select(e) {
    const person = this._graph?.person(e.detail.handle)
    if (person && person.handle !== this._focus) {
      fireEvent(this, 'nav', {path: `person/${person.gramps_id}`})
    }
  }

  _toMe() {
    fireEvent(this, 'nav', {path: ''})
  }

  _setOrientation(orientation) {
    this._orientation = orientation
    try {
      localStorage.setItem(ORIENTATION_KEY, orientation)
    } catch (e) {
      // ignore
    }
  }

  _onSearchInput(e) {
    this._query = e.target.value
    clearTimeout(this._searchTimer)
    if (this._query.trim().length < 2) {
      this._results = []
      return
    }
    this._searchTimer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        searchPeopleUrl(this._query.trim(), this._locale)
      )
      this._results = 'error' in res ? [] : res.data ?? []
    }, 250)
  }

  _openResult(result) {
    this._query = ''
    this._results = []
    fireEvent(this, 'nav', {path: `person/${result.object.gramps_id}`})
  }

  _switchToFull() {
    setUiModeOverride(UI_MODE_FULL)
    fireEvent(window, 'uimode:changed')
  }

  _cards() {
    const cards = new Map()
    for (const person of this._graph?.people() ?? []) {
      cards.set(person.handle, personCard(person))
    }
    return cards
  }

  _relatives(cards) {
    const n = buildNeighborhood(this._graph, this._focus)
    const name = h => cards.get(h)?.name
    return {
      parents: [n.parents.father, n.parents.mother].filter(Boolean).map(name),
      partners: n.partners.map(p => p.partner).filter(Boolean).map(name),
      children: n.partners.reduce((sum, p) => sum + p.children.length, 0),
    }
  }

  _renderSearch() {
    return html`<div class="search">
      <label class="float">
        <grampsjs-icon path="${mdiMagnify}" color="var(--fm-muted)"></grampsjs-icon>
        <input
          type="search"
          .value="${this._query}"
          placeholder="${this._('Search person')}"
          aria-label="${this._('Search person')}"
          @input="${this._onSearchInput}"
        />
      </label>
      ${this._results.length
        ? html`<ul class="results float">
            ${this._results.map(r => {
              const card = personCard(r.object)
              return html`<li>
                <button @click="${() => this._openResult(r)}">
                  ${card.name}<small>${card.years}</small>
                </button>
              </li>`
            })}
          </ul>`
        : ''}
    </div>`
  }

  _renderAccount() {
    return html`<div class="account">
      <button
        class="icon-btn float"
        style="border-radius:999px"
        aria-label="${this._('Account')}"
        aria-expanded="${this._menuOpen}"
        @click="${() => {
          this._menuOpen = !this._menuOpen
        }}"
      >
        <grampsjs-icon path="${mdiAccountCircle}" color="currentColor"></grampsjs-icon>
      </button>
      ${this._menuOpen
        ? html`<div class="menu float">
            ${canSwitchUiMode(this.appState.user?.role)
              ? html`<button @click="${this._switchToFull}">
                  ${this._('Switch to full view')}
                </button>`
              : ''}
            <button @click="${() => this.appState.signout()}">
              ${this._('Log out')}
            </button>
          </div>`
        : ''}
    </div>`
  }

  render() {
    const cards = this._cards()
    const ready = this._graph && this._focus
    const layout = ready
      ? layoutNeighborhood(
          buildNeighborhood(this._graph, this._focus),
          this._orientation
        )
      : {nodes: [], edges: [], width: 0, height: 0}
    return html`
      <div class="main">
        <grampsjs-family-canvas
          .appState="${this.appState}"
          .layout="${layout}"
          .cards="${cards}"
          .selected="${this._focus}"
          @family:select="${this._select}"
        ></grampsjs-family-canvas>
        ${this._noStart
          ? html`<div class="empty">
              ${this._('Search for a person to get started.')}
            </div>`
          : ''}
        <div class="top">
          <button class="pill float" @click="${this._toMe}">
            ${this._('To me')}
          </button>
          ${this._renderSearch()}
          <div class="seg float" role="group" aria-label="${this._('Direction')}">
            <button
              aria-pressed="${this._orientation === ORIENTATION_TTB}"
              aria-label="${this._('Top to bottom')}"
              @click="${() => this._setOrientation(ORIENTATION_TTB)}"
            >
              <grampsjs-icon
                path="${mdiSitemapOutline}"
                color="currentColor"
              ></grampsjs-icon>
            </button>
            <button
              aria-pressed="${this._orientation === ORIENTATION_LTR}"
              aria-label="${this._('Left to right')}"
              @click="${() => this._setOrientation(ORIENTATION_LTR)}"
            >
              <grampsjs-icon
                path="${mdiSitemapOutline}"
                rotate="-90"
                color="currentColor"
              ></grampsjs-icon>
            </button>
          </div>
          ${this._renderAccount()}
        </div>
        <div class="zoom float">
          <button
            class="icon-btn"
            aria-label="${this._('Zoom in')}"
            @click="${() => this.renderRoot.querySelector('grampsjs-family-canvas').zoomBy(1.2)}"
          >
            <grampsjs-icon path="${mdiPlus}" color="currentColor"></grampsjs-icon>
          </button>
          <button
            class="icon-btn"
            aria-label="${this._('Zoom out')}"
            @click="${() => this.renderRoot.querySelector('grampsjs-family-canvas').zoomBy(1 / 1.2)}"
          >
            <grampsjs-icon path="${mdiMinus}" color="currentColor"></grampsjs-icon>
          </button>
        </div>
      </div>
      <grampsjs-family-details
        .appState="${this.appState}"
        .card="${ready ? cards.get(this._focus) : null}"
        .relatives="${ready ? this._relatives(cards) : undefined}"
      ></grampsjs-family-details>
    `
  }
}

window.customElements.define('grampsjs-family-app', GrampsjsFamilyApp)
```

Ohne `card` rendert `GrampsjsFamilyDetails` nichts, daher ist `.relatives = undefined` vor dem Laden unkritisch.

- [ ] **Step 3: In `GrampsJs.js` einbinden**

Imports (bei den übrigen Komponenten-Imports oben):

```js
import './family/GrampsjsFamilyApp.js'
import {
  resolveUiMode,
  getUiModeOverride,
  UI_MODE_FAMILY,
} from './family/uiMode.js'
```

In `_setReady()` direkt nach `this._loadTreeConfig()`:

```js
    this._loadUser()
```

Neue Methode neben `_loadTreeConfig()`:

```js
  _loadUser() {
    this.appState.apiGet('/api/users/-/').then(res => {
      this._updateAppState({user: 'data' in res ? res.data : null})
    })
  }
```

In `connectedCallback()` bei den anderen Window-Listenern:

```js
    window.addEventListener('uimode:changed', () => this.requestUpdate())
```

In `renderContent()` unmittelbar vor `return html\`` mit `<mwc-drawer`:

```js
    if (this.appState.user === undefined) {
      // account details still loading: avoid flashing the full UI
      return html`<md-linear-progress indeterminate></md-linear-progress>`
    }
    const uiMode = resolveUiMode({
      role: this.appState.user?.role,
      username: this.appState.user?.name,
      treeConfig: this.appState.treeConfig,
      override: getUiModeOverride(),
    })
    if (uiMode === UI_MODE_FAMILY) {
      return html`<grampsjs-family-app
        .appState="${this.appState}"
      ></grampsjs-family-app>`
    }
```

- [ ] **Step 4: Menüpunkt in der vollen UI** – `src/components/GrampsjsSettingsMenu.js`

Imports ergänzen:

```js
import {mdiFamilyTree} from '@mdi/js'
import {fireEvent} from '../util.js'
import {
  canSwitchUiMode,
  setUiModeOverride,
  UI_MODE_FAMILY,
} from '../family/uiMode.js'
```

(`fireEvent` neben dem vorhandenen `clickKeyHandler`-Import aus `../util.js` einsortieren, nicht doppelt importieren; `mdiFamilyTree` in den bestehenden `@mdi/js`-Import aufnehmen.)

In `render()` direkt vor `${this._renderAccountItem()}`:

```js
          ${canSwitchUiMode(this.appState.user?.role)
            ? html`<md-menu-item
                @click="${() => {
                  setUiModeOverride(UI_MODE_FAMILY)
                  fireEvent(window, 'uimode:changed')
                }}"
                @keydown="${clickKeyHandler}"
              >
                <div slot="headline">${this._('View family mode')}</div>
                <grampsjs-icon
                  slot="start"
                  path="${mdiFamilyTree}"
                  color="var(--icon-color)"
                ></grampsjs-icon>
              </md-menu-item>`
            : ''}
```

- [ ] **Step 5: Übersetzungen**

Neue Schlüssel (Englisch = Schlüssel in `lang/en.json`, Deutsch in `lang/de.json`), per Skript einfügen, damit die Formatierung der Dateien erhalten bleibt:

```bash
python3 - <<'EOF'
import json
new = {
  '1 child': '1 Kind', '%s children': '%s Kinder', 'with %s': 'mit %s',
  'Children': 'Kinder', 'Unknown': 'Unbekannt', 'Search person': 'Person suchen',
  'To me': 'Zu mir', 'Direction': 'Richtung', 'Top to bottom': 'Von oben nach unten',
  'Left to right': 'Von links nach rechts', 'Zoom in': 'Vergrößern',
  'Zoom out': 'Verkleinern', 'Account': 'Konto',
  'Switch to full view': 'Zur vollen Ansicht', 'View family mode': 'Familien-Modus ansehen',
  'Search for a person to get started.': 'Suche eine Person, um loszulegen.',
  'Born': 'Geboren', 'Died': 'Gestorben', 'Parents': 'Eltern', 'Partners': 'Partner',
  'More': 'Mehr', 'Less': 'Weniger',
}
for f, ind, de in [('lang/en.json', 2, False), ('lang/de.json', 4, True)]:
    d = json.load(open(f))
    for k, v in new.items():
        d.setdefault(k, v if de else k)
    open(f, 'w').write(json.dumps(d, ensure_ascii=False, indent=ind) + '\n')
EOF
grep -n "'Children'\|'Unknown'\|'Born'\|'Died'\|'Parents'\|'Partners'\|'Log out'" src/strings.js
```

Expected: Schlüssel, die `grep` in `src/strings.js` findet, sind Gramps-Strings – diese wieder aus beiden JSON-Dateien entfernen (AGENTS.md: Gramps-Strings nicht in `lang/en.json`).

- [ ] **Step 6: Lint, Tests, Build**

```bash
npx --no-install prettier --write src/family/*.js src/GrampsJs.js src/components/GrampsjsSettingsMenu.js
npx --no-install eslint src/family src/GrampsJs.js src/components/GrampsjsSettingsMenu.js
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build 2>&1 | tail -1
```
Expected: keine ESLint-Fehler, alle Tests grün, `created dist in …`

- [ ] **Step 7: Commit**

```bash
git add src/family src/GrampsJs.js src/components/GrampsjsSettingsMenu.js lang/en.json lang/de.json
git commit -m "Add read-only family mode shell and switch between views"
```

---

### Task 8: Manuelle Prüfung im laufenden Stack

**Files:** keine Änderungen, außer Fehlerkorrekturen aus dieser Prüfung (dann eigener Commit „Fix …“).

- [ ] **Step 1: Stack bauen und starten**

```bash
cd deploy && echo "GRAMPSWEB_SHARE_KEY=testkey123" > .env && docker compose up -d --build
```

- [ ] **Step 2: Beispieldaten und Accounts** – im Browser `http://localhost:8017`: Owner anlegen, unter Admin → Import die Gramps-Beispieldatei `example.gramps` importieren (liegt im API-Image unter `/usr/share/doc/gramps/example/gramps/example.gramps`; per `docker compose cp api:/usr/share/doc/gramps/example/gramps/example.gramps .` holen). In den Einstellungen eine Startperson setzen.

- [ ] **Step 3: Prüfen (Playwright oder von Hand), jeweils PC 1280×800 und Handy 390×844**
  - Owner: volle UI; Konto-Menü → „Familien-Modus ansehen“ → Leinwand; Konto-Menü der Leinwand → „Zur vollen Ansicht“ → volle UI.
  - Share-Link `http://localhost:8017/login#share=testkey123` in privatem Fenster, Namen eingeben → sofort Familien-Modus.
  - Person mit mehreren Ehen (Beispieldaten: Suche nach „Garner“) → Kinder je Partner gruppiert, keine Überlappung, beide Ausrichtungen.
  - Tippen auf Karte → URL `/person/I…`, Leinwand zentriert, Browser-Zurück funktioniert.
  - Suche „Gar“ → Trefferliste, Auswahl springt.
  - Handy: Details als Blatt unten, Griff klappt auf/zu; Leinwand mit einem Finger verschieben, mit zwei zoomen.
  - Dunkelmodus des Systems → lesbare Farben.

- [ ] **Step 4: Aufräumen**

```bash
docker compose down -v && rm .env && cd ..
```

---

### Task 9: Screenshot in die README

**Files:**
- Create: `images/family-mode-desktop.png`, `images/family-mode-phone.png`
- Modify: `README.md` (Abschnitt direkt unter der Einleitung)

- [ ] **Step 1: Screenshots** – mit dem laufenden Stack aus Task 8 (vor dem Aufräumen) per Playwright: PC 1280×800 und Handy 390×844 auf `/person/<ID einer Person mit Eltern, Partner und Kindern>`; speichern unter `images/family-mode-desktop.png` und `images/family-mode-phone.png`. Vorher prüfen, dass keine echten Familiendaten zu sehen sind (nur Beispieldaten).

- [ ] **Step 2: README ergänzen** – nach dem ersten Absatz von `README.md`:

```markdown
## Familien-Modus (dieser Fork)

Familienmitglieder, die über einen Share-Link kommen, sehen eine vereinfachte Oberfläche: den Stammbaum als Leinwand rund um eine Person, mit Suche, „Zu mir“ und umschaltbarer Richtung. Admins wechseln über das Konto-Menü zwischen dieser und der vollen Ansicht.

<p>
  <img src="images/family-mode-desktop.png" alt="Familien-Modus am PC" width="640">
  <img src="images/family-mode-phone.png" alt="Familien-Modus am Handy" width="200">
</p>
```

- [ ] **Step 3: Commit und Push**

```bash
git add images/family-mode-desktop.png images/family-mode-phone.png README.md
git commit -m "Show family mode in the README"
git push origin main
```
