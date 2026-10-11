# Familien-Modus Schritte 2–5 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Familien-Modus wird bearbeitbar: Onboarding „Das bist du“, Verwandtschaftsangabe, Person hinzufügen (inkl. mehrerer Ehen, Dubletten, Orte), Angaben ändern (inkl. Rufname, Beruf, Erinnerung), Foto hochladen und Admin-Spalten „Oberfläche“/„Person“ in der Benutzerverwaltung.

**Architecture:** Reine, getestete Module in `src/family/` (`dates.js`, `personPayload.js`, `relatives.js`, `personEdit.js`, `kinship.js`, `me.js`, `media.js`, `places.js`) erzeugen API-Payloads; Lit-Komponenten (`GrampsjsFamilyDialog`, `…PlaceInput`, `…PersonForm`, `…AddPerson`, `…EditPerson`, `…Photo`, `…Onboarding`) rufen sie auf. Ein neuer Endpoint im API-Fork speichert die Zuordnung Account → Person in der Tree-Config. Undo nutzt das vorhandene `transaction:undo`-Event.

**Tech Stack:** Lit 3 (JS), Vitest + happy-dom, Gramps Web API (Flask, pytest im API-Image).

**Spec:** `design/2026-10-11-familienmodus-design.md` · Vorgänger: `design/plans/2026-10-11-familienmodus-schritt1.md` (umgesetzt auf Branch `family-mode`)

## Global Constraints

- Frontend-Arbeit auf Branch `family-mode` in `gramps-web`; Backend auf neuem Branch `family-mode` in `../gramps-web-api`.
- Neue UI nur in `src/family/`; bestehende Dateien nur an den genannten Stellen.
- Prettier/ESLint des Repos vor jedem Commit (`npx --no-install prettier --write …`, `npx --no-install eslint …`); Backend: `black` im API-Image.
- Icons nur `<grampsjs-icon>`; Texte über `this._()`; neue Schlüssel in `lang/en.json` + `lang/de.json`, Gramps-Strings (in `src/strings.js`) nicht.
- Tokens aus `familyTokens` (`--fm-*`), Akzentfarbe `--fm-add` nur für „hinzufügen“. Bedienflächen ≥ 44 px, sichtbarer Fokus.
- Bearbeiten-Aktionen und gestrichelte Felder nur bei `permissions.canAdd` (Hinzufügen/Foto) bzw. `permissions.canEdit` (Ändern).
- API-Typen als englische Standardnamen (`'Birth'`, `'Death'`, `'Occupation'`, `'Birth Name'`, `'General'`, `'Primary'`).
- Gramps-Date: `{...emptyDate, modifier, dateval: [Tag, Monat, Jahr, false]}`; `emptyDate` und `makeHandle` aus `src/util.js`.
- Commits als `bestora <dennisrehbehn@googlemail.com>` mit Co-Authored-By/Claude-Session-Zeilen.

## Bewusste Entscheidungen

- Dialoge über natives `<dialog>` (`showModal()`): Fokusfalle und Escape vom Browser.
- Datumseingabe als Text: `12.03.1958`, `3.1958`, `1958`, `um 1900`/`ca. 1900`, `vor 1900`, `nach 1900` (deutsche Wörter, Ziffernformate sprachneutral).
- Geburtsname = zusätzlicher Name `type: 'Birth Name'` in `alternate_names`.
- „Lebt noch“ wieder an: Sterbe-Verweis wird aus der Person entfernt (`death_ref_index: -1`), das Ereignis selbst bleibt (per Undo zurückholbar).
- „Gestorben“ ohne Datum/Ort legt trotzdem ein leeres Sterbe-Ereignis an, damit die Person nicht als lebend gilt.
- Onboarding „Mich hinzufügen“ legt die Person an und verknüpft sie; Eltern ergänzt man danach über „+ Mutter/Vater“ an der eigenen Karte.
- Verwandtschaft: Grad (`relationship_string`) + gemeinsame Vorfahren (`/all`), keine Zwischenkette.
- Neue Orte: nur Name, Typ `Unknown`, ohne übergeordneten Ort.

## Review Focus

1. **Kind hinzufügen bei Person mit zwei Ehen** → landet in genau der gewählten Familie, keine neue Familie, andere Familie unverändert. *Test in Task 5.*
2. **Elternteil hinzufügen, wenn der Platz schon besetzt ist** (z. B. zweite Mutter) → verständlicher Fehler statt Überschreiben. *Test in Task 5.*
3. **Unsinnige Datumseingabe** (`31.02.1950`, `13.1950`, `abc`, `1950-02-03`) → Fehlermeldung am Feld, kein Speichern. *Test in Task 3.*
4. **Bearbeiten einer Person ohne Geburts-/Sterbe-Ereignis bzw. mit Verweis-Index auf ein fehlendes Ereignis** → neue Ereignisse werden korrekt angehängt, Indizes stimmen. *Test in Task 6.*
5. **Onboarding mit mehreren gleichnamigen Personen / zweitem Vornamen** → Auswahl statt Raten; „Max Garner“ findet „Max Peter Garner“ nur als Teil-Treffer. *Test in Task 7.*

---

### Task 1: Backend – Account mit Person verknüpfen

**Files (in `../gramps-web-api`):**
- Modify: `gramps_webapi/api/resources/user.py` (neue Klassen am Dateiende)
- Modify: `gramps_webapi/api/__init__.py` (Import + `register_endpt` direkt nach der `UserResource`-Registrierung)
- Test: `tests/test_endpoints/test_user_person.py`

**Interfaces:**
- Produces: `PUT /api/users/<user_name>/person/` mit Body `{"handle": "<handle>" | ""}` → `200 {"handle": …}`. `user_name = "-"` für sich selbst (`PERM_EDIT_OWN_USER`), sonst `PERM_EDIT_OTHER_USER` und gleicher Baum. Speichert in Tree-Config `frontend.userPersons` (`{username: handle}`), leerer Handle entfernt den Eintrag.

- [ ] **Step 1: Branch**

```bash
cd ../gramps-web-api && git checkout -b family-mode
```

- [ ] **Step 2: Failing test**

```python
# tests/test_endpoints/test_user_person.py
"""Tests for linking an account to a person (family mode)."""

import unittest

from gramps_webapi.auth.const import ROLE_EDITOR, ROLE_OWNER

from . import BASE_URL, get_test_client
from .util import fetch_header

KEY = "frontend.userPersons"


class TestUserPerson(unittest.TestCase):
    """PUT /api/users/<name>/person/."""

    @classmethod
    def setUpClass(cls):
        cls.client = get_test_client()

    def _config(self, header):
        rv = self.client.get(BASE_URL + "/trees/-/config", headers=header)
        self.assertEqual(rv.status_code, 200)
        return rv.json.get(KEY, {})

    def test_link_and_clear_own_person(self):
        header = fetch_header(self.client, role=ROLE_EDITOR)
        rv = self.client.put(
            BASE_URL + "/users/-/person/", json={"handle": "H1"}, headers=header
        )
        self.assertEqual(rv.status_code, 200)
        self.assertEqual(self._config(header)["editor"], "H1")
        rv = self.client.put(
            BASE_URL + "/users/-/person/", json={"handle": ""}, headers=header
        )
        self.assertEqual(rv.status_code, 200)
        self.assertNotIn("editor", self._config(header))

    def test_editor_cannot_link_someone_else(self):
        header = fetch_header(self.client, role=ROLE_EDITOR)
        rv = self.client.put(
            BASE_URL + "/users/owner/person/", json={"handle": "H2"}, headers=header
        )
        self.assertEqual(rv.status_code, 403)

    def test_owner_links_another_account_and_keeps_other_config(self):
        header = fetch_header(self.client, role=ROLE_OWNER)
        rv = self.client.put(
            BASE_URL + "/trees/-/config",
            json={"frontend.appTitle": "Familie"},
            headers=header,
        )
        self.assertEqual(rv.status_code, 200)
        rv = self.client.put(
            BASE_URL + "/users/member/person/", json={"handle": "H3"}, headers=header
        )
        self.assertEqual(rv.status_code, 200)
        rv = self.client.get(BASE_URL + "/trees/-/config", headers=header)
        self.assertEqual(rv.json["frontend.appTitle"], "Familie")
        self.assertEqual(rv.json[KEY]["member"], "H3")

    def test_unknown_user(self):
        header = fetch_header(self.client, role=ROLE_OWNER)
        rv = self.client.put(
            BASE_URL + "/users/nobody/person/", json={"handle": "H4"}, headers=header
        )
        self.assertEqual(rv.status_code, 404)
```

- [ ] **Step 3: Run it (im gebauten API-Image) – Expected FAIL (404 für unbekannte Route)**

```bash
docker run --rm -e HF_HUB_OFFLINE=0 -v "$PWD/tests:/app/src/tests" -v "$PWD/gramps_webapi:/app/src/gramps_webapi" -w /app/src --entrypoint sh ancestor-api:latest -c 'pip install -q pytest >/dev/null 2>&1; GRAMPS_RESOURCES=/usr/share python3 -m pytest -q tests/test_endpoints/test_user_person.py 2>&1 | tail -5'
```
Expected: `4 failed` (Routen fehlen). Hinweis: das gemountete `gramps_webapi` überdeckt das installierte Paket nur, wenn `/app/src` vor `site-packages` im Pfad liegt – `python3 -m pytest` aus `/app/src` erfüllt das.

- [ ] **Step 4: Implementation** – am Ende von `gramps_webapi/api/resources/user.py`:

```python
USER_PERSONS_KEY = "frontend.userPersons"


class UserPersonBodySchema(Schema):
    """Body for PUT /users/<name>/person/."""

    handle = fields.Str(
        required=True,
        validate=validate.Length(max=50),
        metadata={
            "description": "Handle of the person the account represents, "
            "or an empty string to remove the link."
        },
    )


class UserPersonResource(ProtectedResource):
    """Link an account to the person it represents in the tree."""

    @api_blueprint.response(200, UserPersonBodySchema)
    @api_blueprint.arguments(UserPersonBodySchema, location="json")
    def put(self, args, user_name: str):
        """Store which person in the tree this account is."""
        tree = get_tree_from_jwt_or_fail()
        if user_name == "-":
            require_permissions([PERM_EDIT_OWN_USER])
            user_name = get_name(get_jwt_identity())
        else:
            require_permissions([PERM_EDIT_OTHER_USER])
            details = get_user_details(user_name)
            if details is None:
                abort_with_message(404, "User not found")
            if details["tree"] and details["tree"] != tree:
                abort_with_message(403, "Forbidden")
        config = dict(get_tree_config(tree))
        persons = dict(config.get(USER_PERSONS_KEY) or {})
        if args["handle"]:
            persons[user_name] = args["handle"]
        else:
            persons.pop(user_name, None)
        config[USER_PERSONS_KEY] = persons
        set_tree_config(tree=tree, config=config)
        return {"handle": args["handle"]}
```

Fehlende Imports oben in `user.py` ergänzen (vorhandene nicht doppeln; mit `grep -n "^from\|^import" gramps_webapi/api/resources/user.py` prüfen): `get_tree_config`, `set_tree_config`, `get_user_details`, `get_name` aus `...auth`; `PERM_EDIT_OWN_USER`, `PERM_EDIT_OTHER_USER` aus `...auth.const`; `get_tree_from_jwt_or_fail`, `abort_with_message` aus `..util`; `require_permissions` aus `..auth`; `get_jwt_identity` aus `flask_jwt_extended`; `Schema` aus `marshmallow`; `fields, validate` aus `webargs`.

In `gramps_webapi/api/__init__.py`: `UserPersonResource` zum bestehenden `from .resources.user import (…)` hinzufügen und direkt nach `register_endpt(UserResource, "/users/<string:user_name>/", "user", tags=["Users"])`:

```python
register_endpt(
    UserPersonResource,
    "/users/<string:user_name>/person/",
    "user_person",
    tags=["Users"],
)
```

- [ ] **Step 5: Run it – Expected PASS**

Befehl aus Step 3. Expected: `4 passed`. Danach `tests/test_endpoints/test_user.py` und `test_trees.py` mit demselben Befehl: alle grün.

- [ ] **Step 6: Format und Commit**

```bash
docker run --rm -v "$PWD:/w" -w /w --entrypoint sh ancestor-api:latest -c 'pip install -q black >/dev/null 2>&1; black gramps_webapi/api/resources/user.py gramps_webapi/api/__init__.py tests/test_endpoints/test_user_person.py'
git add gramps_webapi/api/resources/user.py gramps_webapi/api/__init__.py tests/test_endpoints/test_user_person.py
git commit -m "Add PUT /api/users/<name>/person/ to link an account to a person"
cd ../gramps-web
```

---

### Task 2: Laden neu bei Datenänderung und Platzhalter im Layout

**Files:**
- Modify: `src/family/loader.js`, `src/family/layout.js`
- Test: `test/unit/familyLoader.test.js`, `test/unit/familyLayout.test.js` (ergänzen)

**Interfaces:**
- Produces:
  - `NeighborhoodLoader#reload() → Promise` – lädt die gezeigte Person neu (nach `db:changed`).
  - `layoutNeighborhood(model, orientation, {ghosts = false} = {})` – mit `ghosts: true` zusätzliche Knoten `{kind: 'ghost', relation: 'parent' | 'child', handle: null}`; ein Eltern-Platzhalter, wenn Vater oder Mutter fehlt (im freien Platz), ein Kind-Platzhalter am Ende der Kinderspalte.

- [ ] **Step 1: Failing tests** – an `test/unit/familyLoader.test.js` anhängen:

```js
describe('NeighborhoodLoader#reload', () => {
  it('fetches the shown person again', async () => {
    let calls = 0
    const loader = new NeighborhoodLoader(async id => {
      calls += 1
      return {graph: `g${calls}`, focus: id}
    })
    await loader.load('A')
    await loader.reload()
    expect(calls).toBe(2)
    expect(loader.state.graph).toBe('g2')
  })

  it('does nothing without a shown person', async () => {
    let calls = 0
    const loader = new NeighborhoodLoader(async () => {
      calls += 1
      return {graph: 'g', focus: 'f'}
    })
    await loader.reload()
    expect(calls).toBe(0)
  })
})
```

An `test/unit/familyLayout.test.js` anhängen:

```js
describe('layoutNeighborhood ghosts', () => {
  const half = {
    ...lonely,
    parents: {father: 'H', mother: null},
    partners: [
      {familyHandle: 'f1', partner: 'K', children: [{handle: 'P', childCount: 0}]},
    ],
  }

  it('adds no placeholders by default', () => {
    const layout = layoutNeighborhood(half, ORIENTATION_LTR)
    expect(layout.nodes.filter(n => n.kind === 'ghost')).toHaveLength(0)
  })

  it.each([ORIENTATION_LTR, ORIENTATION_TTB])(
    'adds a parent and a child placeholder without overlap (%s)',
    orientation => {
      const layout = layoutNeighborhood(half, orientation, {ghosts: true})
      const ghosts = layout.nodes.filter(n => n.kind === 'ghost')
      expect(ghosts.map(n => n.relation).sort()).toEqual(['child', 'parent'])
      for (let i = 0; i < layout.nodes.length; i += 1) {
        for (let j = i + 1; j < layout.nodes.length; j += 1) {
          expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false)
        }
      }
    }
  )

  it('offers a child placeholder for a person without children', () => {
    const layout = layoutNeighborhood(lonely, ORIENTATION_LTR, {ghosts: true})
    expect(layout.nodes.map(n => n.relation).filter(Boolean).sort()).toEqual([
      'child',
      'parent',
    ])
  })

  it('offers no parent placeholder when both parents are known', () => {
    const layout = layoutNeighborhood(full, ORIENTATION_LTR, {ghosts: true})
    expect(layout.nodes.filter(n => n.relation === 'parent')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

Run: `npx vitest run test/unit/familyLoader.test.js test/unit/familyLayout.test.js`
Expected: `reload is not a function`; ghost tests fail (keine `ghost`-Knoten).

- [ ] **Step 3: Implementation**

In `src/family/loader.js` in `NeighborhoodLoader` ergänzen:

```js
  async reload() {
    if (!this._shown) return
    const grampsId = this._shown
    this._shown = null
    await this.load(grampsId)
  }
```

In `src/family/layout.js`:
- Signatur: `export function layoutNeighborhood(model, orientation = ORIENTATION_LTR, {ghosts = false} = {}) {`
- Kinderspalte: Vor der Berechnung von `blockExt` den Platzhalter als zusätzliche Gruppe berücksichtigen:

```js
  const ghostChild = ghosts ? 1 : 0
  const blockExt =
    groups.reduce((sum, grp) => sum + groupExt(grp), 0) +
    Math.max(groups.length - 1, 0) * GROUP_GAP +
    (ghostChild ? (groups.length ? GROUP_GAP : 0) + ext(CARD) : 0)
```

  und nach der `for (const grp of groups)`-Schleife:

```js
  if (ghostChild) {
    const item = place('ghost-child', 3, cursor + ext(CARD) / 2, CARD, {
      kind: 'ghost',
      relation: 'child',
      handle: null,
    })
    elbow(far(focus), near(item))
  }
```

  (Die Schleife endet mit `cursor += GROUP_GAP - SIB_GAP`; dadurch steht der Platzhalter im Gruppenabstand unter der letzten Gruppe bzw. mittig, wenn es keine Gruppen gibt.)
- Eltern: In der `for (const [role, center, side] of sides)`-Schleife den `continue` für fehlende Eltern ersetzen durch:

```js
    if (!handle) {
      if (ghosts && !placedParentGhost) {
        placedParentGhost = true
        const item = place(`ghost-parent`, 1, center, CARD, {
          kind: 'ghost',
          relation: 'parent',
          handle: null,
        })
        elbow(far(item), near(focus))
      }
      continue
    }
```

  mit `let placedParentGhost = false` direkt vor der Schleife.

Hinweis: Die Kanten-Anzahl im Bestandstest („connects every relative with a line“ = 11) gilt ohne `ghosts` weiter.

- [ ] **Step 4: Run – Expected PASS**

Run: `npx vitest run test/unit/familyLoader.test.js test/unit/familyLayout.test.js` → alle grün.

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/loader.js src/family/layout.js test/unit/familyLoader.test.js test/unit/familyLayout.test.js
npx --no-install eslint src/family/loader.js src/family/layout.js
git add src/family/loader.js src/family/layout.js test/unit/familyLoader.test.js test/unit/familyLayout.test.js
git commit -m "Add reload and placeholder nodes for the family canvas"
```

---

### Task 3: Datumseingabe

**Files:**
- Create: `src/family/dates.js`
- Test: `test/unit/familyDates.test.js`

**Interfaces:**
- Produces: `parseDateInput(text) → {date: GrampsDate | null} | {error: 'invalid'}`, `formatDateInput(date) → string`

- [ ] **Step 1: Failing test**

```js
// test/unit/familyDates.test.js
import {describe, it, expect} from 'vitest'
import {parseDateInput, formatDateInput} from '../../src/family/dates.js'

const dv = text => parseDateInput(text).date?.dateval
const mod = text => parseDateInput(text).date?.modifier

describe('parseDateInput', () => {
  it('reads full dates, month and year, and year only', () => {
    expect(dv('12.03.1958')).toEqual([12, 3, 1958, false])
    expect(dv('3.5.1932')).toEqual([3, 5, 1932, false])
    expect(dv('3.1958')).toEqual([0, 3, 1958, false])
    expect(dv('1958')).toEqual([0, 0, 1958, false])
  })

  it('reads about, before and after', () => {
    expect(mod('um 1900')).toBe(3)
    expect(mod('ca. 1900')).toBe(3)
    expect(mod('vor 1900')).toBe(1)
    expect(mod('nach 1.1900')).toBe(2)
    expect(mod('1900')).toBe(0)
  })

  it('returns a Gramps date object', () => {
    expect(parseDateInput('1958').date).toMatchObject({
      _class: 'Date',
      calendar: 0,
      quality: 0,
    })
  })

  it('treats empty input as no date', () => {
    expect(parseDateInput('  ')).toEqual({date: null})
    expect(parseDateInput(undefined)).toEqual({date: null})
  })

  it.each(['31.02.1950', '13.1950', '0.1950', 'abc', '1950-02-03', '12.3.58'])(
    'rejects %s',
    text => {
      expect(parseDateInput(text)).toEqual({error: 'invalid'})
    }
  )
})

describe('formatDateInput', () => {
  it('turns Gramps dates back into input text', () => {
    expect(formatDateInput({modifier: 0, dateval: [12, 3, 1958, false]})).toBe(
      '12.03.1958'
    )
    expect(formatDateInput({modifier: 3, dateval: [0, 0, 1900, false]})).toBe(
      'um 1900'
    )
    expect(formatDateInput({modifier: 1, dateval: [0, 5, 1900, false]})).toBe(
      'vor 05.1900'
    )
    expect(formatDateInput(undefined)).toBe('')
    expect(formatDateInput({modifier: 0, dateval: [0, 0, 0, false]})).toBe('')
  })

  it('round-trips through parseDateInput', () => {
    for (const text of ['12.03.1958', '05.1900', '1900', 'um 1900', 'nach 1850']) {
      expect(formatDateInput(parseDateInput(text).date)).toBe(text)
    }
  })
})
```

- [ ] **Step 2: Run – Expected FAIL** (`npx vitest run test/unit/familyDates.test.js`, Import fehlt)

- [ ] **Step 3: Implementation**

```js
// src/family/dates.js
// Plain-text date input for the family UI, converted to and from Gramps
// date objects.
import {emptyDate} from '../util.js'

const MODIFIERS = [
  [/^(um|ca\.?|circa|etwa)\s+/i, 3],
  [/^vor\s+/i, 1],
  [/^nach\s+/i, 2],
]
const PREFIX = {1: 'vor ', 2: 'nach ', 3: 'um '}
const INVALID = {error: 'invalid'}

export function parseDateInput(input) {
  let text = `${input ?? ''}`.trim()
  if (!text) return {date: null}
  let modifier = 0
  for (const [re, value] of MODIFIERS) {
    if (re.test(text)) {
      modifier = value
      text = text.replace(re, '')
      break
    }
  }
  let day = 0
  let month = 0
  let year = 0
  let m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) {
    ;[, day, month, year] = m.map(Number)
  } else if ((m = text.match(/^(\d{1,2})\.(\d{4})$/))) {
    ;[, month, year] = m.map(Number)
  } else if ((m = text.match(/^(\d{4})$/))) {
    year = Number(m[1])
  } else {
    return INVALID
  }
  if (m.length > 2 && (month < 1 || month > 12)) return INVALID
  if (day && day > new Date(year, month, 0).getDate()) return INVALID
  if (m.length === 4 && day < 1) return INVALID
  return {date: {...emptyDate, modifier, dateval: [day, month, year, false]}}
}

export function formatDateInput(date) {
  const [day, month, year] = date?.dateval ?? []
  if (!year) return ''
  const pad = n => String(n).padStart(2, '0')
  let core = `${year}`
  if (day && month) core = `${pad(day)}.${pad(month)}.${year}`
  else if (month) core = `${pad(month)}.${year}`
  return `${PREFIX[date.modifier] ?? ''}${core}`
}
```

- [ ] **Step 4: Run – Expected PASS**

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/dates.js test/unit/familyDates.test.js
npx --no-install eslint src/family/dates.js
git add src/family/dates.js test/unit/familyDates.test.js
git commit -m "Add plain-text date input for family mode"
```

---

### Task 4: Payloads für neue Personen und Orte

**Files:**
- Create: `src/family/personPayload.js`, `src/family/places.js`
- Test: `test/unit/familyPersonPayload.test.js`

**Interfaces:**
- Produces:
  - `GENDER = {FEMALE: 0, MALE: 1, UNKNOWN: 2}`
  - `buildNewPerson({given, surname, gender, birth, death, alive}, makeId) → object[]` – `[Person, Event…]` für `POST /api/objects/`; `birth`/`death` = `{date: GrampsDate|null, place: handle|''}`
  - `placeSearchUrl(query, locale) → string`, `newPlace(name, makeId) → Place`, `placeTitle(searchResultObject) → string`

- [ ] **Step 1: Failing test**

```js
// test/unit/familyPersonPayload.test.js
import {describe, it, expect} from 'vitest'
import {buildNewPerson, GENDER} from '../../src/family/personPayload.js'
import {placeSearchUrl, newPlace, placeTitle} from '../../src/family/places.js'

const ids = () => {
  let n = 0
  return () => `h${(n += 1)}`
}
const date1958 = {_class: 'Date', modifier: 0, dateval: [0, 0, 1958, false]}

describe('buildNewPerson', () => {
  it('creates just the person when nothing else is known', () => {
    const objects = buildNewPerson(
      {given: ' Lisa ', surname: 'Weber ', gender: GENDER.FEMALE, alive: true},
      ids()
    )
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({
      _class: 'Person',
      handle: 'h1',
      gender: 0,
      primary_name: {
        _class: 'Name',
        first_name: 'Lisa',
        surname_list: [{_class: 'Surname', surname: 'Weber'}],
      },
      event_ref_list: [],
    })
    expect(objects[0].birth_ref_index).toBeUndefined()
  })

  it('adds a birth event with date and place', () => {
    const [person, birth] = buildNewPerson(
      {
        given: 'Lisa',
        surname: 'Weber',
        gender: 0,
        birth: {date: date1958, place: 'p1'},
        alive: true,
      },
      ids()
    )
    expect(birth).toMatchObject({
      _class: 'Event',
      handle: 'h2',
      type: 'Birth',
      date: date1958,
      place: 'p1',
    })
    expect(person.event_ref_list).toEqual([
      {_class: 'EventRef', ref: 'h2', role: 'Primary'},
    ])
    expect(person.birth_ref_index).toBe(0)
  })

  it('records a death even without date or place', () => {
    const [person, death] = buildNewPerson(
      {given: 'Otto', surname: 'Weber', gender: 1, alive: false},
      ids()
    )
    expect(death.type).toBe('Death')
    expect(death.date._class).toBe('Date')
    expect(person.death_ref_index).toBe(0)
  })

  it('ignores death data for living people', () => {
    const objects = buildNewPerson(
      {
        given: 'A',
        surname: 'B',
        gender: 2,
        death: {date: date1958, place: ''},
        alive: true,
      },
      ids()
    )
    expect(objects).toHaveLength(1)
  })
})

describe('places', () => {
  it('searches places with a prefix query', () => {
    expect(placeSearchUrl('Flens', 'de')).toContain('query=Flens*')
    expect(placeSearchUrl('Flens', 'de')).toContain('type=place')
  })

  it('builds a minimal new place', () => {
    expect(newPlace(' Kiel ', () => 'p9')).toEqual({
      _class: 'Place',
      handle: 'p9',
      name: {_class: 'PlaceName', value: 'Kiel'},
      place_type: 'Unknown',
    })
  })

  it('names a place from a search result', () => {
    expect(placeTitle({profile: {name: 'Kiel, DE'}, name: {value: 'Kiel'}})).toBe(
      'Kiel, DE'
    )
    expect(placeTitle({name: {value: 'Kiel'}})).toBe('Kiel')
    expect(placeTitle(undefined)).toBe('')
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Implementation**

```js
// src/family/personPayload.js
// Objects for creating a person with birth and death in one request.
import {emptyDate, makeHandle} from '../util.js'

export const GENDER = {FEMALE: 0, MALE: 1, UNKNOWN: 2}

export function buildNewPerson(
  {given = '', surname = '', gender = GENDER.UNKNOWN, birth = {}, death = {}, alive = true},
  makeId = makeHandle
) {
  const person = {
    _class: 'Person',
    handle: makeId(),
    gender,
    citation_list: [],
    primary_name: {
      _class: 'Name',
      first_name: given.trim(),
      surname_list: [{_class: 'Surname', surname: surname.trim()}],
    },
    event_ref_list: [],
  }
  const objects = [person]
  const addEvent = (type, value, indexKey, always = false) => {
    if (!always && !value?.date && !value?.place) return
    const event = {
      _class: 'Event',
      handle: makeId(),
      type,
      date: value?.date ?? {...emptyDate},
      place: value?.place || '',
      citation_list: [],
    }
    person[indexKey] = person.event_ref_list.length
    person.event_ref_list.push({
      _class: 'EventRef',
      ref: event.handle,
      role: 'Primary',
    })
    objects.push(event)
  }
  addEvent('Birth', birth, 'birth_ref_index')
  if (!alive) addEvent('Death', death, 'death_ref_index', true)
  return objects
}
```

```js
// src/family/places.js
// Place search and creation for the family UI.
import {makeHandle} from '../util.js'

export function placeSearchUrl(query, locale) {
  return `/api/search/?query=${encodeURIComponent(
    `${query}*`
  )}&type=place&profile=self&locale=${locale}&page=1&pagesize=8`
}

export function newPlace(name, makeId = makeHandle) {
  return {
    _class: 'Place',
    handle: makeId(),
    name: {_class: 'PlaceName', value: name.trim()},
    place_type: 'Unknown',
  }
}

export function placeTitle(place) {
  return place?.profile?.name || place?.name?.value || ''
}
```

- [ ] **Step 4: Run – Expected PASS**

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/personPayload.js src/family/places.js test/unit/familyPersonPayload.test.js
npx --no-install eslint src/family/personPayload.js src/family/places.js
git add src/family/personPayload.js src/family/places.js test/unit/familyPersonPayload.test.js
git commit -m "Add family mode payloads for new people and places"
```

---

### Task 5: Verwandte verknüpfen

**Files:**
- Create: `src/family/relatives.js`
- Test: `test/unit/familyRelatives.test.js`

**Interfaces:**
- Consumes: `linkParent(appState, personData, parentHandle, role)`, `linkSpouse(appState, personData, spouseHandle)` aus `src/util/familyLinks.js`; `focusPerson` = Rohdaten aus dem `FamilyGraph` (mit `extended.primary_parent_family`, `extended.families`).
- Produces:
  - `RELATION = {PARENT: 'parent', PARTNER: 'partner', CHILD: 'child', SIBLING: 'sibling'}`
  - `canAddParent(focusPerson) → boolean`
  - `parentRole(focusPerson, gender) → 'father' | 'mother' | null` (`null` = Platz besetzt)
  - `linkRelative(appState, {relation, focusPerson, handle, gender, familyHandle}) → Promise<{transaction: object[]} | {error: string}>` (`familyHandle` nur für Kinder; `''` = neue Familie ohne Partner)

- [ ] **Step 1: Failing test**

```js
// test/unit/familyRelatives.test.js
import {describe, it, expect} from 'vitest'
import {
  RELATION,
  canAddParent,
  parentRole,
  linkRelative,
} from '../../src/family/relatives.js'

const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({_class: 'ChildRef', ref})),
  extended: {x: 1},
})

function fakeAppState() {
  const calls = []
  const reply = (method, url, body) => {
    calls.push({method, url, body})
    return {data: [{type: method === 'POST' ? 'add' : 'update', url}]}
  }
  return {
    calls,
    apiPut: async (url, body) => reply('PUT', url, body),
    apiPost: async (url, body) => reply('POST', url, body),
  }
}

// Anna (female) with two marriages and a father but no mother
const anna = {
  handle: 'A',
  gender: 0,
  extended: {
    primary_parent_family: fam('fP', 'H', '', ['A']),
    families: [fam('fK', 'K', 'A', ['P']), fam('fZ', 'Z', 'A', ['T'])],
  },
}

describe('parent slots', () => {
  it('knows which parent is missing', () => {
    expect(canAddParent(anna)).toBe(true)
    expect(parentRole(anna, 0)).toBe('mother')
    expect(parentRole(anna, 1)).toBe(null)
    expect(parentRole(anna, 2)).toBe('mother')
  })

  it('allows both roles without a parent family', () => {
    const orphan = {handle: 'O', gender: 1, extended: {families: []}}
    expect(parentRole(orphan, 1)).toBe('father')
    expect(parentRole(orphan, 0)).toBe('mother')
  })

  it('refuses a third parent', () => {
    const full = {
      handle: 'F',
      extended: {primary_parent_family: fam('fP', 'H', 'E', ['F'])},
    }
    expect(canAddParent(full)).toBe(false)
  })
})

describe('linkRelative', () => {
  it('adds a child to the chosen marriage only', async () => {
    const appState = fakeAppState()
    const res = await linkRelative(appState, {
      relation: RELATION.CHILD,
      focusPerson: anna,
      handle: 'L',
      familyHandle: 'fZ',
    })
    expect(appState.calls).toHaveLength(1)
    const [call] = appState.calls
    expect(call.method).toBe('PUT')
    expect(call.url).toBe('/api/families/fZ')
    expect(call.body.child_ref_list.map(c => c.ref)).toEqual(['T', 'L'])
    expect(call.body.extended).toBeUndefined()
    expect(res.transaction).toHaveLength(1)
  })

  it('starts a new family for a child with another partner', async () => {
    const appState = fakeAppState()
    await linkRelative(appState, {
      relation: RELATION.CHILD,
      focusPerson: anna,
      handle: 'L',
      familyHandle: '',
    })
    expect(appState.calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/families/',
      body: {
        _class: 'Family',
        mother_handle: 'A',
        child_ref_list: [{_class: 'ChildRef', ref: 'L'}],
      },
    })
  })

  it('adds a sibling to the parent family', async () => {
    const appState = fakeAppState()
    await linkRelative(appState, {
      relation: RELATION.SIBLING,
      focusPerson: anna,
      handle: 'S',
    })
    expect(appState.calls[0].url).toBe('/api/families/fP')
    expect(appState.calls[0].body.child_ref_list.map(c => c.ref)).toEqual([
      'A',
      'S',
    ])
  })

  it('creates a parent family for a sibling when there is none', async () => {
    const appState = fakeAppState()
    await linkRelative(appState, {
      relation: RELATION.SIBLING,
      focusPerson: {handle: 'O', gender: 1, extended: {families: []}},
      handle: 'S',
    })
    expect(appState.calls[0]).toMatchObject({
      method: 'POST',
      body: {
        child_ref_list: [
          {_class: 'ChildRef', ref: 'O'},
          {_class: 'ChildRef', ref: 'S'},
        ],
      },
    })
  })

  it('fills the free parent slot', async () => {
    const appState = fakeAppState()
    await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusPerson: anna,
      handle: 'M',
      gender: 0,
    })
    expect(appState.calls[0].url).toBe('/api/families/fP')
    expect(appState.calls[0].body.mother_handle).toBe('M')
    expect(appState.calls[0].body.father_handle).toBe('H')
  })

  it('refuses to replace an existing parent', async () => {
    const appState = fakeAppState()
    const res = await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusPerson: anna,
      handle: 'X',
      gender: 1,
    })
    expect(res.error).toBe('This person already has a father.')
    expect(appState.calls).toHaveLength(0)
  })

  it('adds a partner as a new family', async () => {
    const appState = fakeAppState()
    await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusPerson: anna,
      handle: 'N',
    })
    expect(appState.calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/families/',
      body: {mother_handle: 'A', father_handle: 'N'},
    })
  })

  it('passes API errors through', async () => {
    const appState = {
      apiPost: async () => ({error: 'boom'}),
      apiPut: async () => ({error: 'boom'}),
    }
    const res = await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusPerson: anna,
      handle: 'N',
    })
    expect(res).toEqual({error: 'boom'})
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Implementation**

```js
// src/family/relatives.js
// Links a newly created or existing person to the focus person.
import {linkParent, linkSpouse} from '../util/familyLinks.js'

export const RELATION = {
  PARENT: 'parent',
  PARTNER: 'partner',
  CHILD: 'child',
  SIBLING: 'sibling',
}

const clean = ({extended, profile, backlinks, formatted, ...rest}) => rest
const childRef = ref => ({_class: 'ChildRef', ref})
const parentFamily = person => person.extended?.primary_parent_family

export function canAddParent(focusPerson) {
  const family = parentFamily(focusPerson)
  return !family?.father_handle || !family?.mother_handle
}

export function parentRole(focusPerson, gender) {
  const family = parentFamily(focusPerson)
  const free = role => !family?.[`${role}_handle`]
  if (gender === 0) return free('mother') ? 'mother' : null
  if (gender === 1) return free('father') ? 'father' : null
  if (free('mother')) return 'mother'
  return free('father') ? 'father' : null
}

const addChild = (appState, family, handle) =>
  appState.apiPut(`/api/families/${family.handle}`, {
    _class: 'Family',
    ...clean(family),
    child_ref_list: [...(family.child_ref_list ?? []), childRef(handle)],
  })

async function link(appState, {relation, focusPerson, handle, gender, familyHandle}) {
  switch (relation) {
    case RELATION.PARENT: {
      const role = parentRole(focusPerson, gender)
      if (!role) {
        return {
          error:
            gender === 0
              ? 'This person already has a mother.'
              : 'This person already has a father.',
        }
      }
      return linkParent(appState, focusPerson, handle, role)
    }
    case RELATION.PARTNER:
      return linkSpouse(appState, focusPerson, handle)
    case RELATION.CHILD: {
      const family = (focusPerson.extended?.families ?? []).find(
        f => f.handle === familyHandle
      )
      if (family) return addChild(appState, family, handle)
      const slot = focusPerson.gender === 0 ? 'mother_handle' : 'father_handle'
      return appState.apiPost('/api/families/', {
        _class: 'Family',
        [slot]: focusPerson.handle,
        child_ref_list: [childRef(handle)],
      })
    }
    case RELATION.SIBLING: {
      const family = parentFamily(focusPerson)
      if (family?.handle) return addChild(appState, family, handle)
      return appState.apiPost('/api/families/', {
        _class: 'Family',
        child_ref_list: [childRef(focusPerson.handle), childRef(handle)],
      })
    }
    default:
      return {error: `Unknown relation ${relation}`}
  }
}

export async function linkRelative(appState, options) {
  const res = await link(appState, options)
  if ('error' in res) return {error: res.error}
  return {transaction: res.data ?? []}
}
```

Hinweis zu `linkSpouse`: Es verwendet eine bestehende Familie nur, wenn die Person genau eine Familie hat und dort der Partnerplatz leer ist (z. B. Familie mit Kind, aber ohne zweiten Elternteil). Für Anna mit zwei Ehen entsteht korrekt eine neue Familie (Test „adds a partner as a new family“).

- [ ] **Step 4: Run – Expected PASS**

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/relatives.js test/unit/familyRelatives.test.js
npx --no-install eslint src/family/relatives.js
git add src/family/relatives.js test/unit/familyRelatives.test.js
git commit -m "Add linking of new relatives in family mode"
```

---

### Task 6: Angaben ändern – Payload

**Files:**
- Create: `src/family/personEdit.js`
- Test: `test/unit/familyPersonEdit.test.js`

**Interfaces:**
- Produces:
  - `editValues(person, events) → EditValues` (vorausgefüllte Formularwerte)
    ```
    EditValues = {given, surname, birthName, callName, occupation, memory: '',
                  birth: {date, place, placeName}, death: {date, place, placeName}, alive}
    ```
    `person` = Rohdaten mit `extended.events` (`GET /api/people/<h>?extend=event_ref_list&profile=self`), `events` = `person.extended.events`; `placeName` aus `person.profile.birth/death.place_name`.
  - `buildPersonEdit(person, events, values, makeId) → {person, newObjects, updatedEvents}` – `person` bereinigt (ohne `extended/profile/backlinks/formatted`, mit `_class`), `newObjects` = neue Events/Notizen für `POST /api/objects/`, `updatedEvents` = geänderte Events für `PUT /api/events/<h>`.

- [ ] **Step 1: Failing test**

```js
// test/unit/familyPersonEdit.test.js
import {describe, it, expect} from 'vitest'
import {editValues, buildPersonEdit} from '../../src/family/personEdit.js'

const ids = () => {
  let n = 0
  return () => `n${(n += 1)}`
}
const d = (y, m = 0, day = 0) => ({
  _class: 'Date',
  modifier: 0,
  dateval: [day, m, y, false],
})
const ev = (handle, type, date, place = '', description = '') => ({
  _class: 'Event',
  handle,
  type,
  date,
  place,
  description,
})

const anna = () => ({
  _class: 'Person',
  handle: 'A',
  gender: 0,
  primary_name: {
    _class: 'Name',
    first_name: 'Anna',
    call: '',
    surname_list: [{_class: 'Surname', surname: 'Müller'}],
  },
  alternate_names: [],
  event_ref_list: [
    {_class: 'EventRef', ref: 'eB', role: 'Primary'},
    {_class: 'EventRef', ref: 'eO', role: 'Primary'},
  ],
  birth_ref_index: 0,
  death_ref_index: -1,
  note_list: [],
  profile: {birth: {place_name: 'Flensburg'}, death: {}},
  extended: {
    events: [
      ev('eB', 'Birth', d(1932, 5, 3), 'pF'),
      ev('eO', 'Occupation', d(0), '', 'Lehrerin'),
    ],
  },
  backlinks: {},
})

const values = (person, patch = {}) => ({
  ...editValues(person, person.extended.events),
  ...patch,
})

describe('editValues', () => {
  it('prefills the form from the person', () => {
    const p = anna()
    expect(editValues(p, p.extended.events)).toEqual({
      given: 'Anna',
      surname: 'Müller',
      birthName: '',
      callName: '',
      occupation: 'Lehrerin',
      memory: '',
      birth: {date: d(1932, 5, 3), place: 'pF', placeName: 'Flensburg'},
      death: {date: null, place: '', placeName: ''},
      alive: true,
    })
  })
})

describe('buildPersonEdit', () => {
  it('changes names and strips computed keys', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {given: 'Anne', callName: 'Änne', birthName: 'Schmidt'}),
      ids()
    )
    expect(res.person.primary_name.first_name).toBe('Anne')
    expect(res.person.primary_name.call).toBe('Änne')
    expect(res.person.alternate_names).toEqual([
      {
        _class: 'Name',
        type: 'Birth Name',
        first_name: 'Anne',
        surname_list: [{_class: 'Surname', surname: 'Schmidt'}],
      },
    ])
    expect(res.person.extended).toBeUndefined()
    expect(res.person.profile).toBeUndefined()
    expect(res.person.backlinks).toBeUndefined()
    expect(res.newObjects).toEqual([])
    expect(res.updatedEvents).toEqual([])
  })

  it('updates the existing birth event', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {birth: {date: d(1933), place: 'pK'}}),
      ids()
    )
    expect(res.updatedEvents).toEqual([
      {...p.extended.events[0], date: d(1933), place: 'pK'},
    ])
  })

  it('adds a death event and points death_ref_index at it', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {alive: false, death: {date: d(2011), place: 'pK'}}),
      ids()
    )
    expect(res.newObjects).toEqual([
      {
        _class: 'Event',
        handle: 'n1',
        type: 'Death',
        date: d(2011),
        place: 'pK',
        citation_list: [],
      },
    ])
    expect(res.person.event_ref_list.at(-1)).toEqual({
      _class: 'EventRef',
      ref: 'n1',
      role: 'Primary',
    })
    expect(res.person.death_ref_index).toBe(2)
  })

  it('removes the death reference when the person is alive again', () => {
    const p = anna()
    p.event_ref_list.push({_class: 'EventRef', ref: 'eD', role: 'Primary'})
    p.death_ref_index = 2
    p.extended.events.push(ev('eD', 'Death', d(2011)))
    const res = buildPersonEdit(p, p.extended.events, values(p, {alive: true}), ids())
    expect(res.person.event_ref_list.map(r => r.ref)).toEqual(['eB', 'eO'])
    expect(res.person.death_ref_index).toBe(-1)
    expect(res.person.birth_ref_index).toBe(0)
  })

  it('updates the occupation description', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {occupation: 'Rektorin'}),
      ids()
    )
    expect(res.updatedEvents).toEqual([
      {...p.extended.events[1], description: 'Rektorin'},
    ])
  })

  it('saves a memory as a new plain-text note', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {memory: ' Sie backte den besten Kuchen. '}),
      ids()
    )
    expect(res.newObjects).toEqual([
      {
        _class: 'Note',
        handle: 'n1',
        type: 'General',
        text: {
          _class: 'StyledText',
          string: 'Sie backte den besten Kuchen.',
          tags: [],
        },
      },
    ])
    expect(res.person.note_list).toEqual(['n1'])
  })

  it('creates a birth event when the reference points nowhere', () => {
    const p = anna()
    p.birth_ref_index = 5
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {birth: {date: d(1932), place: ''}}),
      ids()
    )
    expect(res.newObjects[0]).toMatchObject({type: 'Birth', handle: 'n1'})
    expect(res.person.birth_ref_index).toBe(2)
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Implementation**

```js
// src/family/personEdit.js
// Turns the family edit form into updates of a person and its events.
import {emptyDate, makeHandle} from '../util.js'

const strip = ({extended, profile, backlinks, formatted, ...rest}) => rest
const sameDate = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const isEmptyDate = date => !date?.dateval?.[2]

function eventAt(person, events, indexKey) {
  const ref = person.event_ref_list?.[person[indexKey]]
  return ref ? events.find(e => e.handle === ref.ref) : undefined
}

const occupationOf = (person, events) =>
  (person.event_ref_list ?? [])
    .map(ref => events.find(e => e.handle === ref.ref))
    .find(e => e?.type === 'Occupation')

const birthNameOf = person =>
  (person.alternate_names ?? []).find(n => n.type === 'Birth Name')

export function editValues(person, events) {
  const birth = eventAt(person, events, 'birth_ref_index')
  const death = eventAt(person, events, 'death_ref_index')
  const eventValues = (e, profile) => ({
    date: e && !isEmptyDate(e.date) ? e.date : null,
    place: e?.place ?? '',
    placeName: e ? profile?.place_name ?? '' : '',
  })
  return {
    given: person.primary_name?.first_name ?? '',
    surname: person.primary_name?.surname_list?.[0]?.surname ?? '',
    birthName: birthNameOf(person)?.surname_list?.[0]?.surname ?? '',
    callName: person.primary_name?.call ?? '',
    occupation: occupationOf(person, events)?.description ?? '',
    memory: '',
    birth: eventValues(birth, person.profile?.birth),
    death: eventValues(death, person.profile?.death),
    alive: !death,
  }
}

export function buildPersonEdit(person, events, values, makeId = makeHandle) {
  const next = {_class: 'Person', ...strip(person)}
  next.event_ref_list = [...(person.event_ref_list ?? [])]
  next.note_list = [...(person.note_list ?? [])]
  const newObjects = []
  const updatedEvents = []

  const surnames = [...(person.primary_name?.surname_list ?? [])]
  surnames[0] = {_class: 'Surname', ...surnames[0], surname: values.surname.trim()}
  next.primary_name = {
    _class: 'Name',
    ...person.primary_name,
    first_name: values.given.trim(),
    call: values.callName.trim(),
    surname_list: surnames,
  }

  const birthName = values.birthName.trim()
  const others = (person.alternate_names ?? []).filter(n => n.type !== 'Birth Name')
  next.alternate_names = birthName
    ? [
        ...others,
        {
          _class: 'Name',
          ...birthNameOf(person),
          type: 'Birth Name',
          first_name: values.given.trim(),
          surname_list: [{_class: 'Surname', surname: birthName}],
        },
      ]
    : others

  const appendEvent = event => {
    newObjects.push(event)
    next.event_ref_list.push({_class: 'EventRef', ref: event.handle, role: 'Primary'})
    return next.event_ref_list.length - 1
  }

  const saveEvent = (type, indexKey, value, always = false) => {
    const existing = eventAt(person, events, indexKey)
    const date = value.date ?? null
    if (existing) {
      const changed =
        !sameDate(isEmptyDate(existing.date) ? null : existing.date, date) ||
        (existing.place ?? '') !== (value.place ?? '')
      if (changed) {
        updatedEvents.push({...existing, date: date ?? {...emptyDate}, place: value.place ?? ''})
      }
      return
    }
    if (!always && !date && !value.place) return
    next[indexKey] = appendEvent({
      _class: 'Event',
      handle: makeId(),
      type,
      date: date ?? {...emptyDate},
      place: value.place ?? '',
      citation_list: [],
    })
  }

  saveEvent('Birth', 'birth_ref_index', values.birth)
  if (values.alive) {
    const death = eventAt(person, events, 'death_ref_index')
    if (death) {
      const index = person.death_ref_index
      next.event_ref_list.splice(index, 1)
      next.death_ref_index = -1
      if (next.birth_ref_index > index) next.birth_ref_index -= 1
    }
  } else {
    saveEvent('Death', 'death_ref_index', values.death, true)
  }

  const occupation = values.occupation.trim()
  const job = occupationOf(person, events)
  if (job && (job.description ?? '') !== occupation) {
    updatedEvents.push({...job, description: occupation})
  } else if (!job && occupation) {
    appendEvent({
      _class: 'Event',
      handle: makeId(),
      type: 'Occupation',
      description: occupation,
      date: {...emptyDate},
      place: '',
      citation_list: [],
    })
  }

  const memory = values.memory.trim()
  if (memory) {
    const note = {
      _class: 'Note',
      handle: makeId(),
      type: 'General',
      text: {_class: 'StyledText', string: memory, tags: []},
    }
    newObjects.push(note)
    next.note_list.push(note.handle)
  }

  return {person: next, newObjects, updatedEvents}
}
```

- [ ] **Step 4: Run – Expected PASS** (`npx vitest run test/unit/familyPersonEdit.test.js`)

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/personEdit.js test/unit/familyPersonEdit.test.js
npx --no-install eslint src/family/personEdit.js
git add src/family/personEdit.js test/unit/familyPersonEdit.test.js
git commit -m "Add family mode person edit payloads"
```

---

### Task 7: „Das bist du“, Verwandtschaft, Fotos – reine Helfer

**Files:**
- Create: `src/family/me.js`, `src/family/kinship.js`, `src/family/media.js`
- Modify: `src/family/familyApi.js` (zwei URL-Helfer)
- Test: `test/unit/familyMe.test.js`

**Interfaces:**
- Produces:
  - `normalizeName(text) → string`; `matchPeopleByName(people, fullName) → {exact: Person[], partial: Person[]}` (`people` = Rohpersonen mit `profile`)
  - `myPersonHandle(treeConfig, username) → string`
  - `onboardingDone(username) → boolean`, `setOnboardingDone(username, done = true)`
  - `kinship(one, all, nameOf) → {relation: string, ancestors: string[]}` (`one` = Antwort `/relations/a/b`, `all` = Antwort `/relations/a/b/all`, `nameOf(handle) → string`)
  - `withMediaRef(mediaList, mediaHandle, asProfile) → MediaRef[]`
  - `relationUrls(me, other, locale) → {one, all}`, `personUrl(handle) → string` (in `familyApi.js`)

- [ ] **Step 1: Failing test**

```js
// test/unit/familyMe.test.js
import {describe, it, expect, beforeEach} from 'vitest'
import {
  normalizeName,
  matchPeopleByName,
  myPersonHandle,
  onboardingDone,
  setOnboardingDone,
} from '../../src/family/me.js'
import {kinship} from '../../src/family/kinship.js'
import {withMediaRef} from '../../src/family/media.js'
import {relationUrls, personUrl} from '../../src/family/familyApi.js'

const p = (handle, given, surname) => ({
  handle,
  profile: {name_given: given, name_surname: surname},
})

describe('matchPeopleByName', () => {
  const people = [
    p('a', 'Max', 'Garner'),
    p('b', 'Max', 'Garner'),
    p('c', 'Max Peter', 'Garner'),
    p('d', 'Moritz', 'Garner'),
  ]

  it('normalises case, accents and spaces', () => {
    expect(normalizeName('  Jörg   MÜLLER ')).toBe('jörg müller')
  })

  it('separates exact from partial matches', () => {
    const res = matchPeopleByName(people, 'max  garner')
    expect(res.exact.map(x => x.handle)).toEqual(['a', 'b'])
    expect(res.partial.map(x => x.handle)).toEqual(['c'])
  })

  it('finds nothing for an unknown name', () => {
    expect(matchPeopleByName(people, 'Erika Mustermann')).toEqual({
      exact: [],
      partial: [],
    })
  })
})

describe('myPersonHandle', () => {
  it('reads the link from the tree config', () => {
    const config = {'frontend.userPersons': {max: 'H1'}}
    expect(myPersonHandle(config, 'max')).toBe('H1')
    expect(myPersonHandle(config, 'moritz')).toBe('')
    expect(myPersonHandle(undefined, 'max')).toBe('')
  })
})

describe('onboarding flag', () => {
  beforeEach(() => localStorage.clear())

  it('is remembered per account', () => {
    expect(onboardingDone('max')).toBe(false)
    setOnboardingDone('max')
    expect(onboardingDone('max')).toBe(true)
    expect(onboardingDone('moritz')).toBe(false)
    setOnboardingDone('max', false)
    expect(onboardingDone('max')).toBe(false)
  })
})

describe('kinship', () => {
  const names = {h1: 'Hans Müller', h2: 'Erna Müller'}
  it('combines the relation and the common ancestors', () => {
    expect(
      kinship(
        {relationship_string: 'Großtante'},
        [{relationship_string: 'Großtante', common_ancestors: ['h1', 'h2']}],
        h => names[h]
      )
    ).toEqual({relation: 'Großtante', ancestors: ['Hans Müller', 'Erna Müller']})
  })

  it('copes with no relation', () => {
    expect(kinship({relationship_string: ''}, [{}], () => '')).toEqual({
      relation: '',
      ancestors: [],
    })
    expect(kinship(undefined, undefined, () => '')).toEqual({
      relation: '',
      ancestors: [],
    })
  })
})

describe('withMediaRef', () => {
  const list = [{ref: 'm1'}, {ref: 'm2', rect: [0, 0, 50, 50]}]
  it('appends a photo, or puts it first as profile picture', () => {
    expect(withMediaRef(list, 'm3', false).map(r => r.ref)).toEqual(['m1', 'm2', 'm3'])
    expect(withMediaRef(list, 'm3', true).map(r => r.ref)).toEqual(['m3', 'm1', 'm2'])
  })
  it('moves an existing photo instead of duplicating it', () => {
    expect(withMediaRef(list, 'm2', true)).toEqual([
      {ref: 'm2', rect: [0, 0, 50, 50]},
      {ref: 'm1'},
    ])
    expect(withMediaRef(undefined, 'm1', false)).toEqual([
      {_class: 'MediaRef', ref: 'm1'},
    ])
  })
})

describe('familyApi URLs', () => {
  it('builds relation and person URLs', () => {
    expect(relationUrls('a', 'b', 'de')).toEqual({
      one: '/api/relations/a/b?locale=de',
      all: '/api/relations/a/b/all?locale=de',
    })
    expect(personUrl('h')).toBe('/api/people/h?extend=event_ref_list&profile=self')
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Implementation**

```js
// src/family/me.js
// Which person in the tree the logged-in account is.
import {TREE_CONFIG_USER_PERSONS} from './uiMode.js'

export function normalizeName(text) {
  return `${text ?? ''}`.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

const fullNameOf = person =>
  normalizeName(`${person.profile?.name_given ?? ''} ${person.profile?.name_surname ?? ''}`)

export function matchPeopleByName(people, fullName) {
  const wanted = normalizeName(fullName)
  const tokens = wanted.split(' ').filter(Boolean)
  const exact = []
  const partial = []
  for (const person of people) {
    const name = fullNameOf(person)
    if (name === wanted) exact.push(person)
    else if (tokens.length && tokens.every(t => name.split(' ').includes(t))) {
      partial.push(person)
    }
  }
  return {exact, partial}
}

export function myPersonHandle(treeConfig, username) {
  return treeConfig?.[TREE_CONFIG_USER_PERSONS]?.[username] ?? ''
}

const key = username => `grampsjs_family_onboarding_${username}`

export function onboardingDone(username) {
  try {
    return localStorage.getItem(key(username)) === '1'
  } catch (e) {
    return false
  }
}

export function setOnboardingDone(username, done = true) {
  try {
    if (done) localStorage.setItem(key(username), '1')
    else localStorage.removeItem(key(username))
  } catch (e) {
    // ignore
  }
}
```

```js
// src/family/kinship.js
// "deine Großtante" and the shared ancestors of two people.
export function kinship(one, all, nameOf) {
  const first = Array.isArray(all) ? all[0] ?? {} : {}
  return {
    relation: one?.relationship_string || first.relationship_string || '',
    ancestors: (first.common_ancestors ?? []).map(nameOf).filter(Boolean),
  }
}
```

```js
// src/family/media.js
// Photo references of a person.
export function withMediaRef(mediaList, mediaHandle, asProfile) {
  const list = mediaList ?? []
  const existing = list.find(r => r.ref === mediaHandle)
  const ref = existing ?? {_class: 'MediaRef', ref: mediaHandle}
  const others = list.filter(r => r.ref !== mediaHandle)
  return asProfile ? [ref, ...others] : [...others, ref]
}
```

An `src/family/familyApi.js` anhängen:

```js
export function relationUrls(me, other, locale) {
  return {
    one: `/api/relations/${me}/${other}?locale=${locale}`,
    all: `/api/relations/${me}/${other}/all?locale=${locale}`,
  }
}

export function personUrl(handle) {
  return `/api/people/${handle}?extend=event_ref_list&profile=self`
}
```

- [ ] **Step 4: Run – Expected PASS**

- [ ] **Step 5: Commit**

```bash
npx --no-install prettier --write src/family/me.js src/family/kinship.js src/family/media.js src/family/familyApi.js test/unit/familyMe.test.js
npx --no-install eslint src/family/me.js src/family/kinship.js src/family/media.js src/family/familyApi.js
git add src/family/me.js src/family/kinship.js src/family/media.js src/family/familyApi.js test/unit/familyMe.test.js
git commit -m "Add family mode helpers for me, kinship and photos"
```

---

### Task 8: Dialog, Ortsfeld und Personenformular

**Files:**
- Create: `src/family/GrampsjsFamilyDialog.js`, `src/family/GrampsjsFamilyPlaceInput.js`, `src/family/GrampsjsFamilyPersonForm.js`

**Interfaces:**
- Consumes: `parseDateInput`, `formatDateInput` (Task 3), `placeSearchUrl`, `placeTitle` (Task 4), `searchPeopleUrl` (Schritt 1), `personCard`.
- Produces:
  - `<grampsjs-family-dialog .open heading>` – Inhalt per Slot, Escape/× schließt, feuert `family-dialog:close`. Mobil als Blatt von unten.
  - `<grampsjs-family-place-input .appState .label .value>` – `value = {handle, name}`; `handle: ''` + `name` = neuer Ort. Feuert `change`.
  - `<grampsjs-family-person-form .appState .mode .relation .partners .genderChoice .values .excludeHandle .saving>`
    - `mode: 'add' | 'edit'`, `partners: [{familyHandle, name}]` (nur Kind), `genderChoice: [{gender, label}]`
    - feuert `family-form:submit` mit `{values}` (`values` wie `EditValues`, Datumsfelder bereits geparst, `gender`, `familyHandle`)
    - feuert `family-form:link` mit `{handle}` („Meinst du diese Person?“)

Komponenten sind laut AGENTS.md ohne Unit-Tests; geprüft in Task 12.

- [ ] **Step 1: Dialog**

```js
// src/family/GrampsjsFamilyDialog.js
// Modal dialog of the family UI on top of the native <dialog> element:
// centred on wide screens, a bottom sheet on narrow ones.
import {html, css, LitElement} from 'lit'
import {mdiClose} from '@mdi/js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import '../components/GrampsjsIcon.js'

class GrampsjsFamilyDialog extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        dialog {
          border: none;
          padding: 0;
          border-radius: 22px;
          width: min(520px, calc(100vw - 32px));
          max-height: calc(100dvh - 48px);
          background: var(--fm-card);
          color: var(--fm-ink);
          box-shadow: 0 24px 60px -20px rgba(20, 40, 30, 0.5);
        }
        dialog::backdrop {
          background: rgba(20, 32, 26, 0.35);
        }
        header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px 12px 4px 22px;
        }
        h2 {
          flex: 1;
          margin: 0;
          font-size: 20px;
        }
        .close {
          width: 44px;
          height: 44px;
          border: none;
          background: none;
          border-radius: 50%;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .body {
          padding: 8px 22px 22px;
          overflow-y: auto;
        }
        @media (max-width: 991px) {
          dialog {
            width: 100vw;
            max-width: 100vw;
            margin: auto 0 0;
            border-radius: 22px 22px 0 0;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      heading: {type: String},
    }
  }

  constructor() {
    super()
    this.open = false
    this.heading = ''
  }

  updated(changed) {
    if (!changed.has('open')) return
    const dialog = this.renderRoot.querySelector('dialog')
    if (this.open && !dialog.open) dialog.showModal()
    if (!this.open && dialog.open) dialog.close()
  }

  _close() {
    fireEvent(this, 'family-dialog:close')
  }

  render() {
    return html`<dialog
      aria-label="${this.heading}"
      @cancel="${e => {
        e.preventDefault()
        this._close()
      }}"
    >
      <header>
        <h2>${this.heading}</h2>
        <button class="close" aria-label="${this._('Close')}" @click="${this._close}">
          <grampsjs-icon path="${mdiClose}" color="currentColor"></grampsjs-icon>
        </button>
      </header>
      <div class="body"><slot></slot></div>
    </dialog>`
  }
}

window.customElements.define('grampsjs-family-dialog', GrampsjsFamilyDialog)
```

- [ ] **Step 2: Ortsfeld**

```js
// src/family/GrampsjsFamilyPlaceInput.js
// Text field with place suggestions; typing a name that is not in the tree
// keeps it as a new place to be created on save.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {placeSearchUrl, placeTitle} from './places.js'

class GrampsjsFamilyPlaceInput extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          position: relative;
        }
        ul {
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          z-index: 3;
          margin: 4px 0 0;
          padding: 6px;
          list-style: none;
          background: var(--fm-card);
          border-radius: 12px;
          box-shadow: 0 10px 24px -10px rgba(20, 40, 30, 0.45);
        }
        li button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 8px;
          padding: 0 10px;
          cursor: pointer;
        }
        li button:hover {
          background: var(--fm-leaf);
        }
        .new {
          font-size: 13px;
          color: var(--fm-muted);
          margin-top: 2px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      label: {type: String},
      value: {type: Object},
      _results: {state: true},
    }
  }

  constructor() {
    super()
    this.label = ''
    this.value = {handle: '', name: ''}
    this._results = []
    this._timer = null
  }

  _set(value) {
    this.value = value
    fireEvent(this, 'change', {value})
  }

  _onInput(e) {
    const name = e.target.value
    this._set({handle: '', name})
    clearTimeout(this._timer)
    if (name.trim().length < 2) {
      this._results = []
      return
    }
    this._timer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        placeSearchUrl(name.trim(), this.appState.settings?.lang || 'en')
      )
      if (this.value.name !== name) return
      this._results = 'error' in res ? [] : res.data ?? []
    }, 250)
  }

  _pick(result) {
    clearTimeout(this._timer)
    this._results = []
    this._set({handle: result.handle, name: placeTitle(result.object)})
  }

  render() {
    return html`
      <label class="field">
        <span>${this.label}</span>
        <input
          class="input"
          .value="${this.value?.name ?? ''}"
          placeholder="${this._('Search place')}"
          autocomplete="off"
          @input="${this._onInput}"
          @keydown="${e => {
            if (e.key === 'Escape' && this._results.length) {
              e.stopPropagation()
              this._results = []
            }
          }}"
        />
      </label>
      ${this.value?.name && !this.value.handle && !this._results.length
        ? html`<div class="new">${this._('New place')}</div>`
        : ''}
      ${this._results.length
        ? html`<ul>
            ${this._results.map(
              r => html`<li>
                <button type="button" @click="${() => this._pick(r)}">
                  ${placeTitle(r.object)}
                </button>
              </li>`
            )}
          </ul>`
        : ''}
    `
  }
}

window.customElements.define(
  'grampsjs-family-place-input',
  GrampsjsFamilyPlaceInput
)
```

In `src/family/familyStyles.js` an `familyStyles` (nach `.pill`) gemeinsame Formularstile anhängen:

```css
  .field {
    display: block;
    margin-bottom: 12px;
  }
  .field > span {
    display: block;
    font-size: 14px;
    color: var(--fm-muted);
    margin-bottom: 4px;
  }
  .input {
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    border: 1.5px solid var(--fm-border);
    border-radius: 12px;
    padding: 8px 12px;
    font: inherit;
    font-size: 16px;
    background: var(--fm-card);
    color: var(--fm-ink);
  }
  .input:focus-visible {
    outline: 3px solid var(--fm-focus-ring);
    outline-offset: 1px;
  }
  .input[aria-invalid='true'] {
    border-color: #b3261e;
  }
  .error {
    color: #b3261e;
    font-size: 14px;
    margin-top: 4px;
  }
  .primary {
    width: 100%;
    min-height: 48px;
    border: none;
    border-radius: 14px;
    background: var(--fm-add);
    color: #fff;
    font-weight: 700;
    font-size: 17px;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .secondary {
    min-height: 44px;
    border: none;
    border-radius: 12px;
    background: var(--fm-leaf);
    font-weight: 700;
    padding: 0 16px;
    cursor: pointer;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    min-height: 40px;
    border: 1.5px solid var(--fm-border);
    border-radius: 999px;
    padding: 0 14px;
    background: var(--fm-card);
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--fm-moss);
    background: var(--fm-leaf);
  }
```

- [ ] **Step 3: Personenformular**

```js
// src/family/GrampsjsFamilyPersonForm.js
// Short form for adding or editing a person in the family UI.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {parseDateInput, formatDateInput} from './dates.js'
import {searchPeopleUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyPlaceInput.js'

const emptyEvent = {date: null, place: '', placeName: ''}

export const emptyValues = () => ({
  given: '',
  surname: '',
  birthName: '',
  callName: '',
  occupation: '',
  memory: '',
  birth: {...emptyEvent},
  death: {...emptyEvent},
  alive: true,
})

class GrampsjsFamilyPersonForm extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .switch {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 44px;
          margin-bottom: 8px;
        }
        .switch input {
          width: 22px;
          height: 22px;
        }
        .dupe {
          background: var(--fm-add-tint);
          border-radius: 14px;
          padding: 10px 12px;
          margin-bottom: 12px;
        }
        .dupe b {
          display: block;
          margin-bottom: 6px;
          font-size: 15px;
        }
        .dupe button {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 44px;
          border: none;
          border-radius: 10px;
          background: var(--fm-card);
          padding: 6px 10px;
          margin-top: 4px;
          cursor: pointer;
          text-align: left;
        }
        .dupe em {
          font-style: normal;
          font-weight: 700;
          color: var(--fm-add);
        }
        details {
          margin: 4px 0 12px;
        }
        summary {
          min-height: 44px;
          display: flex;
          align-items: center;
          font-weight: 700;
          color: var(--fm-moss);
          cursor: pointer;
        }
        textarea.input {
          min-height: 96px;
          resize: vertical;
        }
      `,
    ]
  }

  static get properties() {
    return {
      mode: {type: String},
      partners: {type: Array},
      genderChoice: {type: Array},
      values: {type: Object},
      excludeHandle: {type: String},
      saving: {type: Boolean},
      _v: {state: true},
      _gender: {state: true},
      _familyHandle: {state: true},
      _dates: {state: true},
      _errors: {state: true},
      _dupes: {state: true},
    }
  }

  constructor() {
    super()
    this.mode = 'add'
    this.partners = []
    this.genderChoice = []
    this.values = emptyValues()
    this.excludeHandle = ''
    this.saving = false
    this._v = emptyValues()
    this._gender = 2
    this._familyHandle = ''
    this._dates = {birth: '', death: ''}
    this._errors = {}
    this._dupes = []
    this._dupeTimer = null
  }

  willUpdate(changed) {
    if (changed.has('values')) {
      this._v = structuredClone(this.values)
      this._dates = {
        birth: formatDateInput(this.values.birth?.date),
        death: formatDateInput(this.values.death?.date),
      }
      this._errors = {}
    }
    if (changed.has('genderChoice') && this.genderChoice.length) {
      this._gender = this.genderChoice[0].gender
    }
    if (changed.has('partners')) {
      this._familyHandle = this.partners[0]?.familyHandle ?? ''
    }
  }

  _setField(key, value) {
    this._v = {...this._v, [key]: value}
    if (this.mode === 'add' && (key === 'given' || key === 'surname')) {
      this._findDupes()
    }
  }

  _findDupes() {
    clearTimeout(this._dupeTimer)
    const query = `${this._v.given} ${this._v.surname}`.trim()
    if (query.length < 3) {
      this._dupes = []
      return
    }
    this._dupeTimer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        searchPeopleUrl(query, this.appState.settings?.lang || 'en')
      )
      const current = `${this._v.given} ${this._v.surname}`.trim()
      if (current !== query || 'error' in res) return
      this._dupes = (res.data ?? [])
        .map(r => r.object)
        .filter(o => o.handle !== this.excludeHandle)
        .slice(0, 3)
    }, 300)
  }

  _submit(e) {
    e.preventDefault()
    const errors = {}
    const parsed = {}
    for (const key of ['birth', 'death']) {
      const res = parseDateInput(this._dates[key])
      if (res.error) errors[key] = this._('Please enter e.g. 12.03.1958 or 1958.')
      else parsed[key] = res.date
    }
    if (!this._v.given.trim() && !this._v.surname.trim()) {
      errors.name = this._('Please enter a name.')
    }
    this._errors = errors
    if (Object.keys(errors).length) return
    fireEvent(this, 'family-form:submit', {
      values: {
        ...this._v,
        birth: {...this._v.birth, date: parsed.birth},
        death: {...this._v.death, date: parsed.death},
        gender: this._gender,
        familyHandle: this._familyHandle,
      },
    })
  }

  _dateField(key, label) {
    return html`<label class="field">
      <span>${label}</span>
      <input
        class="input"
        inputmode="text"
        placeholder="${this._('e.g. 12.03.1958 or 1958')}"
        .value="${this._dates[key]}"
        aria-invalid="${Boolean(this._errors[key])}"
        @input="${e => {
          this._dates = {...this._dates, [key]: e.target.value}
        }}"
      />
      ${this._errors[key] ? html`<div class="error">${this._errors[key]}</div>` : ''}
    </label>`
  }

  _placeField(key, label) {
    const v = this._v[key]
    return html`<grampsjs-family-place-input
      class="field"
      .appState="${this.appState}"
      .label="${label}"
      .value="${{handle: v.place, name: v.placeName}}"
      @change="${e =>
        this._setField(key, {
          ...this._v[key],
          place: e.detail.value.handle,
          placeName: e.detail.value.name,
        })}"
    ></grampsjs-family-place-input>`
  }

  _chips(items, selected, onPick) {
    return html`<div class="chips field">
      ${items.map(
        item => html`<button
          type="button"
          class="chip"
          aria-pressed="${item.value === selected}"
          @click="${() => onPick(item.value)}"
        >
          ${item.label}
        </button>`
      )}
    </div>`
  }

  render() {
    const v = this._v
    return html`<form @submit="${this._submit}" novalidate>
      ${this.partners.length > 1
        ? html`<div class="field">
            <span>${this._('With whom?')}</span>
            ${this._chips(
              [
                ...this.partners.map(p => ({value: p.familyHandle, label: p.name})),
                {value: '', label: this._('someone else')},
              ],
              this._familyHandle,
              value => {
                this._familyHandle = value
              }
            )}
          </div>`
        : ''}
      ${this.genderChoice.length
        ? this._chips(
            this.genderChoice.map(g => ({value: g.gender, label: g.label})),
            this._gender,
            value => {
              this._gender = value
            }
          )
        : ''}
      <div class="row2">
        <label class="field">
          <span>${this._('First name')}</span>
          <input
            class="input"
            autocomplete="off"
            .value="${v.given}"
            aria-invalid="${Boolean(this._errors.name)}"
            @input="${e => this._setField('given', e.target.value)}"
          />
        </label>
        <label class="field">
          <span>${this._('Last name')}</span>
          <input
            class="input"
            autocomplete="off"
            .value="${v.surname}"
            @input="${e => this._setField('surname', e.target.value)}"
          />
        </label>
      </div>
      ${this._errors.name ? html`<div class="error">${this._errors.name}</div>` : ''}
      ${this._dupes.length
        ? html`<div class="dupe">
            <b>${this._('Do you mean this person?')}</b>
            ${this._dupes.map(o => {
              const card = personCard(o)
              return html`<button
                type="button"
                @click="${() => fireEvent(this, 'family-form:link', {handle: o.handle})}"
              >
                <span>${card.name} <small>${card.years}</small></span>
                <em>${this._('Link')}</em>
              </button>`
            })}
          </div>`
        : ''}
      ${this.mode === 'edit'
        ? html`<label class="field">
            <span>${this._('Birth name')}</span>
            <input
              class="input"
              .value="${v.birthName}"
              @input="${e => this._setField('birthName', e.target.value)}"
            />
          </label>`
        : ''}
      <div class="row2">
        ${this._dateField('birth', this._('Born on'))}
        ${this._placeField('birth', this._('Born in'))}
      </div>
      <label class="switch">
        <span>${this._('Still alive')}</span>
        <input
          type="checkbox"
          .checked="${v.alive}"
          @change="${e => this._setField('alive', e.target.checked)}"
        />
      </label>
      ${v.alive
        ? ''
        : html`<div class="row2">
            ${this._dateField('death', this._('Died on'))}
            ${this._placeField('death', this._('Died in'))}
          </div>`}
      ${this.mode === 'edit'
        ? html`<details>
            <summary>${this._('More details')}</summary>
            <label class="field">
              <span>${this._('Call name')}</span>
              <input
                class="input"
                .value="${v.callName}"
                @input="${e => this._setField('callName', e.target.value)}"
              />
            </label>
            <label class="field">
              <span>${this._('Occupation')}</span>
              <input
                class="input"
                .value="${v.occupation}"
                @input="${e => this._setField('occupation', e.target.value)}"
              />
            </label>
            <label class="field">
              <span>${this._('Add a memory')}</span>
              <textarea
                class="input"
                .value="${v.memory}"
                @input="${e => this._setField('memory', e.target.value)}"
              ></textarea>
            </label>
          </details>`
        : ''}
      <button class="primary" type="submit" ?disabled="${this.saving}">
        ${this.mode === 'edit' ? this._('Save changes') : this._('Add person')}
      </button>
    </form>`
  }
}

window.customElements.define(
  'grampsjs-family-person-form',
  GrampsjsFamilyPersonForm
)
```

Hinweis: In `_submit` werden `alive`-abhängig ungültige Sterbedaten nur geprüft, wenn das Feld sichtbar war – `this._dates.death` ist bei „Lebt noch“ leer oder wird ignoriert, weil `buildNewPerson`/`buildPersonEdit` Sterbedaten bei `alive: true` verwerfen. Damit ein verstecktes, ungültiges Sterbedatum nicht blockiert, beim Umschalten auf `alive = true` `this._dates = {...this._dates, death: ''}` setzen: im `@change` des Schalters `if (e.target.checked) this._dates = {...this._dates, death: ''}` vor `_setField` ergänzen.

- [ ] **Step 4: Lint, Build, Commit**

```bash
npx --no-install prettier --write src/family/GrampsjsFamilyDialog.js src/family/GrampsjsFamilyPlaceInput.js src/family/GrampsjsFamilyPersonForm.js src/family/familyStyles.js
npx --no-install eslint src/family
npm run build 2>&1 | tail -1
git add src/family/GrampsjsFamilyDialog.js src/family/GrampsjsFamilyPlaceInput.js src/family/GrampsjsFamilyPersonForm.js src/family/familyStyles.js
git commit -m "Add family mode dialog, place field and person form"
```
Expected: keine ESLint-Fehler, `created dist in …`.

---

### Task 9: Abläufe Hinzufügen, Ändern, Foto, Onboarding

**Files:**
- Create: `src/family/GrampsjsFamilyAddPerson.js`, `src/family/GrampsjsFamilyEditPerson.js`, `src/family/GrampsjsFamilyPhoto.js`, `src/family/GrampsjsFamilyOnboarding.js`, `src/family/saveHelpers.js`
- Test: `test/unit/familySaveHelpers.test.js`

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces:
  - `ensurePlaces(appState, values) → Promise<{values, transaction} | {error}>` (legt neue Orte an und setzt deren Handles ein)
  - `fireUndo(target, message, transaction, redirect)` (feuert `transaction:undo`)
  - `<grampsjs-family-add-person .appState .open .focusPerson .graph .preset>` – `preset: '' | 'parent' | 'child'`; feuert `family-dialog:close`
  - `<grampsjs-family-edit-person .appState .open .handle>`
  - `<grampsjs-family-photo .appState .open .focusPerson>`
  - `<grampsjs-family-onboarding .appState .open .force>` – feuert `family-onboarding:done` mit `{handle}` (`''` = später)

- [ ] **Step 1: Failing test für die Speicherhelfer**

```js
// test/unit/familySaveHelpers.test.js
import {describe, it, expect} from 'vitest'
import {ensurePlaces, fireUndo} from '../../src/family/saveHelpers.js'

const values = (birthPlace, deathPlace) => ({
  birth: {date: null, ...birthPlace},
  death: {date: null, ...deathPlace},
})

describe('ensurePlaces', () => {
  it('creates new places once and fills in their handles', async () => {
    const posted = []
    const appState = {
      apiPost: async (url, body) => {
        posted.push({url, body})
        return {data: [{type: 'add', handle: body.handle}]}
      },
    }
    const res = await ensurePlaces(
      appState,
      values({place: '', placeName: 'Kiel'}, {place: '', placeName: ' kiel '}),
      () => 'pNew'
    )
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toBe('/api/places/')
    expect(res.values.birth.place).toBe('pNew')
    expect(res.values.death.place).toBe('pNew')
    expect(res.transaction).toHaveLength(1)
  })

  it('keeps known places and empty fields untouched', async () => {
    const appState = {
      apiPost: async () => {
        throw new Error('must not be called')
      },
    }
    const res = await ensurePlaces(
      appState,
      values({place: 'p1', placeName: 'Flensburg'}, {place: '', placeName: ''}),
      () => 'x'
    )
    expect(res.values.birth.place).toBe('p1')
    expect(res.values.death.place).toBe('')
    expect(res.transaction).toEqual([])
  })

  it('stops on an API error', async () => {
    const appState = {apiPost: async () => ({error: 'boom'})}
    const res = await ensurePlaces(
      appState,
      values({place: '', placeName: 'Kiel'}, {}),
      () => 'x'
    )
    expect(res).toEqual({error: 'boom'})
  })
})

describe('fireUndo', () => {
  it('dispatches transaction:undo with the combined transaction', () => {
    let detail
    window.addEventListener('transaction:undo', e => {
      detail = e.detail
    }, {once: true})
    const el = document.createElement('div')
    document.body.appendChild(el)
    fireUndo(el, 'Saved', [{a: 1}, {b: 2}], 'person/I1')
    expect(detail).toEqual({
      message: 'Saved',
      transaction: [{a: 1}, {b: 2}],
      redirect: 'person/I1',
    })
  })
})
```

- [ ] **Step 2: Run – Expected FAIL**

- [ ] **Step 3: Speicherhelfer**

```js
// src/family/saveHelpers.js
// Shared steps of the family save flows.
import {makeHandle, fireEvent} from '../util.js'
import {newPlace} from './places.js'

const norm = s => `${s ?? ''}`.trim().toLowerCase()

export async function ensurePlaces(appState, values, makeId = makeHandle) {
  const created = new Map()
  const transaction = []
  const next = {...values}
  for (const key of ['birth', 'death']) {
    const v = values[key]
    if (!v || v.place || !norm(v.placeName)) continue
    let handle = created.get(norm(v.placeName))
    if (!handle) {
      const place = newPlace(v.placeName, makeId)
      // eslint-disable-next-line no-await-in-loop
      const res = await appState.apiPost('/api/places/', place, {
        dbChanged: false,
      })
      if ('error' in res) return {error: res.error}
      transaction.push(...(res.data ?? []))
      handle = place.handle
      created.set(norm(v.placeName), handle)
    }
    next[key] = {...v, place: handle}
  }
  return {values: next, transaction}
}

export function fireUndo(target, message, transaction, redirect) {
  fireEvent(target, 'transaction:undo', {message, transaction, redirect})
}
```

Run: `npx vitest run test/unit/familySaveHelpers.test.js` → PASS (`fireEvent` feuert mit `bubbles: true, composed: true`, daher erreicht es `window`; falls nicht: `fireEvent`-Implementierung in `src/util.js` prüfen und stattdessen `window.dispatchEvent(new CustomEvent('transaction:undo', {detail}))` verwenden – als Ruling festhalten).

- [ ] **Step 4: Ablauf „Person hinzufügen“**

```js
// src/family/GrampsjsFamilyAddPerson.js
// "Person hinzufügen": choose the relation, fill in the short form, save.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {buildNewPerson, GENDER} from './personPayload.js'
import {RELATION, canAddParent, linkRelative} from './relatives.js'
import {ensurePlaces, fireUndo} from './saveHelpers.js'
import {personCard} from './personCard.js'
import {emptyValues} from './GrampsjsFamilyPersonForm.js'
import './GrampsjsFamilyDialog.js'
import './GrampsjsFamilyPersonForm.js'

class GrampsjsFamilyAddPerson extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .choices {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .choice {
          min-height: 88px;
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          background: var(--fm-card);
          padding: 12px;
          text-align: left;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
        }
        .choice small {
          display: block;
          font-weight: 400;
          font-size: 13px;
          color: var(--fm-muted);
          margin-top: 4px;
        }
        .choice:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .back {
          border: none;
          background: none;
          color: var(--fm-moss);
          font-weight: 700;
          min-height: 44px;
          padding: 0;
          cursor: pointer;
          margin-bottom: 4px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      focusPerson: {type: Object},
      graph: {type: Object},
      preset: {type: String},
      _relation: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.focusPerson = null
    this.graph = null
    this.preset = ''
    this._relation = ''
    this._saving = false
  }

  willUpdate(changed) {
    if (changed.has('open') && this.open) {
      this._relation = this.preset || ''
      this._saving = false
    }
  }

  get _focusName() {
    return personCard(this.focusPerson).givenName || personCard(this.focusPerson).name
  }

  _partners() {
    const focus = this.focusPerson?.handle
    return (this.focusPerson?.extended?.families ?? [])
      .filter(f => f.father_handle === focus || f.mother_handle === focus)
      .map(f => {
        const partner = f.father_handle === focus ? f.mother_handle : f.father_handle
        return {
          familyHandle: f.handle,
          name: partner
            ? personCard(this.graph?.person(partner)).name || this._('Unknown')
            : this._('Unknown'),
        }
      })
  }

  _genderChoice() {
    const female = {
      [RELATION.PARENT]: this._('Mother'),
      [RELATION.CHILD]: this._('Daughter'),
      [RELATION.SIBLING]: this._('Sister'),
      [RELATION.PARTNER]: this._('Woman'),
    }[this._relation]
    const male = {
      [RELATION.PARENT]: this._('Father'),
      [RELATION.CHILD]: this._('Son'),
      [RELATION.SIBLING]: this._('Brother'),
      [RELATION.PARTNER]: this._('Man'),
    }[this._relation]
    return [
      {gender: GENDER.FEMALE, label: female},
      {gender: GENDER.MALE, label: male},
    ]
  }

  _initialValues() {
    const surname = this.focusPerson?.profile?.name_surname ?? ''
    const keepSurname = [RELATION.CHILD, RELATION.SIBLING].includes(this._relation)
    return {...emptyValues(), surname: keepSurname ? surname : ''}
  }

  async _save(e) {
    const {values} = e.detail
    this._saving = true
    const places = await ensurePlaces(this.appState, values)
    if ('error' in places) return this._fail(places.error)
    const objects = buildNewPerson({...places.values, gender: values.gender})
    const created = await this.appState.apiPost('/api/objects/', objects, {
      dbChanged: false,
    })
    if ('error' in created) return this._fail(created.error)
    await this._link(objects[0].handle, values, [
      ...places.transaction,
      ...(created.data ?? []),
    ])
    return undefined
  }

  async _linkExisting(e) {
    this._saving = true
    const person = this.graph?.person(e.detail.handle)
    await this._link(e.detail.handle, {gender: person?.gender ?? GENDER.UNKNOWN}, [])
  }

  async _link(handle, values, transaction) {
    const res = await linkRelative(this.appState, {
      relation: this._relation,
      focusPerson: this.focusPerson,
      handle,
      gender: values.gender,
      familyHandle: values.familyHandle ?? '',
    })
    if ('error' in res) {
      // the new person exists even though linking failed
      fireEvent(this, 'db:changed')
      return this._fail(this._(res.error))
    }
    fireEvent(this, 'db:changed')
    fireUndo(
      this,
      this._('Person added'),
      [...transaction, ...res.transaction],
      `person/${this.focusPerson.gramps_id}`
    )
    this._saving = false
    fireEvent(this, 'family-dialog:close')
    return undefined
  }

  _fail(message) {
    this._saving = false
    fireEvent(this, 'grampsjs:error', {message})
  }

  _renderChoices() {
    const parentOk = canAddParent(this.focusPerson ?? {})
    const choice = (relation, label, hint, disabled = false) => html`<button
      class="choice"
      ?disabled="${disabled}"
      @click="${() => {
        this._relation = relation
      }}"
    >
      ${label}<small>${hint}</small>
    </button>`
    return html`<div class="choices">
      ${choice(
        RELATION.PARENT,
        this._('Mother or father'),
        parentOk ? '' : this._('Both are already known'),
        !parentOk
      )}
      ${choice(RELATION.PARTNER, this._('Partner'), this._('Marriage or partnership'))}
      ${choice(RELATION.CHILD, this._('Child'), this._('Son or daughter'))}
      ${choice(RELATION.SIBLING, this._('Sibling'), this._('Brother or sister'))}
    </div>`
  }

  render() {
    const heading = this._relation
      ? this._('Add person')
      : this._('Whom would you like to add?')
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${heading}"
    >
      ${this._relation
        ? html`${this.preset
              ? ''
              : html`<button
                  class="back"
                  @click="${() => {
                    this._relation = ''
                  }}"
                >
                  ${this._('Back')}
                </button>`}
            <grampsjs-family-person-form
              .appState="${this.appState}"
              mode="add"
              .values="${this._initialValues()}"
              .partners="${this._relation === RELATION.CHILD ? this._partners() : []}"
              .genderChoice="${this._genderChoice()}"
              .excludeHandle="${this.focusPerson?.handle ?? ''}"
              ?saving="${this._saving}"
              @family-form:submit="${this._save}"
              @family-form:link="${this._linkExisting}"
            ></grampsjs-family-person-form>`
        : this._renderChoices()}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-add-person',
  GrampsjsFamilyAddPerson
)
```

Hinweis: `_initialValues()` wird bei jedem Render neu erzeugt; damit das Formular Eingaben nicht verliert, das Ergebnis in `willUpdate` bei Änderung von `_relation` oder `open` in `this._formValues` cachen und `.values="${this._formValues}"` übergeben.

Hinweis: Wird eine vorgeschlagene Person verknüpft, die nicht im geladenen Graphen ist, ist `gender` unbekannt (2); für Eltern wählt `parentRole` dann den freien Platz.

- [ ] **Step 5: Ablauf „Angaben ändern“**

```js
// src/family/GrampsjsFamilyEditPerson.js
// "Angaben ändern": prefilled short form, saved as person and event updates.
import {html, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {editValues, buildPersonEdit} from './personEdit.js'
import {ensurePlaces, fireUndo} from './saveHelpers.js'
import {personUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyDialog.js'
import './GrampsjsFamilyPersonForm.js'

class GrampsjsFamilyEditPerson extends GrampsjsAppStateMixin(LitElement) {
  static get properties() {
    return {
      open: {type: Boolean},
      handle: {type: String},
      _person: {state: true},
      _values: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.handle = ''
    this._person = null
    this._values = null
    this._saving = false
  }

  async updated(changed) {
    if ((changed.has('open') || changed.has('handle')) && this.open && this.handle) {
      this._person = null
      const res = await this.appState.apiGet(personUrl(this.handle))
      if ('error' in res) {
        fireEvent(this, 'grampsjs:error', {message: res.error})
        return
      }
      this._person = res.data
      this._values = editValues(res.data, res.data.extended?.events ?? [])
    }
  }

  async _save(e) {
    this._saving = true
    const places = await ensurePlaces(this.appState, e.detail.values)
    if ('error' in places) return this._fail(places.error)
    const events = this._person.extended?.events ?? []
    const edit = buildPersonEdit(this._person, events, places.values)
    const transaction = [...places.transaction]
    if (edit.newObjects.length) {
      const res = await this.appState.apiPost('/api/objects/', edit.newObjects, {
        dbChanged: false,
      })
      if ('error' in res) return this._fail(res.error)
      transaction.push(...(res.data ?? []))
    }
    for (const event of edit.updatedEvents) {
      const {extended, profile, backlinks, formatted, ...clean} = event
      // eslint-disable-next-line no-await-in-loop
      const res = await this.appState.apiPut(`/api/events/${event.handle}`, clean, {
        dbChanged: false,
      })
      if ('error' in res) return this._fail(res.error)
      transaction.push(...(res.data ?? []))
    }
    const res = await this.appState.apiPut(`/api/people/${this.handle}`, edit.person)
    if ('error' in res) return this._fail(res.error)
    transaction.push(...(res.data ?? []))
    fireUndo(
      this,
      this._('Changes saved'),
      transaction,
      `person/${this._person.gramps_id}`
    )
    this._saving = false
    fireEvent(this, 'family-dialog:close')
    return undefined
  }

  _fail(message) {
    this._saving = false
    fireEvent(this, 'grampsjs:error', {message})
  }

  render() {
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._person ? personCard(this._person).name : this._('Loading')}"
    >
      ${this._values
        ? html`<grampsjs-family-person-form
            .appState="${this.appState}"
            mode="edit"
            .values="${this._values}"
            ?saving="${this._saving}"
            @family-form:submit="${this._save}"
          ></grampsjs-family-person-form>`
        : ''}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-edit-person',
  GrampsjsFamilyEditPerson
)
```

Hinweis: `personCard(this._person)` braucht `profile`; `personUrl` fragt `profile=self` mit an.

- [ ] **Step 6: Ablauf „Foto hochladen“**

```js
// src/family/GrampsjsFamilyPhoto.js
// "Foto hochladen": camera or gallery, who is in it, when, profile picture.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent, fileWithMimeType} from '../util.js'
import {parseDateInput} from './dates.js'
import {withMediaRef} from './media.js'
import {fireUndo} from './saveHelpers.js'
import {searchPeopleUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyDialog.js'

class GrampsjsFamilyPhoto extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .preview {
          width: 100%;
          max-height: 260px;
          object-fit: contain;
          border-radius: 14px;
          background: var(--fm-leaf);
          margin-bottom: 12px;
        }
        .pick {
          display: grid;
          place-items: center;
          min-height: 160px;
          border: 2px dashed var(--fm-border);
          border-radius: 14px;
          margin-bottom: 12px;
          cursor: pointer;
          font-weight: 700;
          color: var(--fm-moss);
        }
        .pick input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
        }
        .results {
          list-style: none;
          margin: 4px 0 0;
          padding: 0;
        }
        .results button {
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: var(--fm-leaf);
          border-radius: 10px;
          padding: 0 10px;
          margin-top: 4px;
          cursor: pointer;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          margin-bottom: 12px;
        }
        .check input {
          width: 22px;
          height: 22px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      focusPerson: {type: Object},
      _file: {state: true},
      _preview: {state: true},
      _people: {state: true},
      _query: {state: true},
      _results: {state: true},
      _when: {state: true},
      _desc: {state: true},
      _profile: {state: true},
      _error: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.focusPerson = null
    this._reset()
  }

  _reset() {
    if (this._preview) URL.revokeObjectURL(this._preview)
    this._file = null
    this._preview = ''
    this._people = []
    this._query = ''
    this._results = []
    this._when = ''
    this._desc = ''
    this._profile = false
    this._error = ''
    this._saving = false
  }

  willUpdate(changed) {
    if (changed.has('open') && this.open) {
      this._reset()
      if (this.focusPerson) {
        this._people = [
          {handle: this.focusPerson.handle, name: personCard(this.focusPerson).name},
        ]
      }
    }
  }

  _onFile(e) {
    const [file] = e.target.files
    if (!file) return
    if (this._preview) URL.revokeObjectURL(this._preview)
    this._file = file
    this._preview = URL.createObjectURL(file)
  }

  async _search(e) {
    this._query = e.target.value
    const query = this._query.trim()
    if (query.length < 2) {
      this._results = []
      return
    }
    const res = await this.appState.apiGet(
      searchPeopleUrl(query, this.appState.settings?.lang || 'en')
    )
    if (this._query.trim() !== query) return
    this._results = 'error' in res ? [] : (res.data ?? []).map(r => r.object)
  }

  _addPerson(object) {
    if (!this._people.some(p => p.handle === object.handle)) {
      this._people = [...this._people, {handle: object.handle, name: personCard(object).name}]
    }
    this._query = ''
    this._results = []
  }

  async _save() {
    const when = parseDateInput(this._when)
    if (when.error) {
      this._error = this._('Please enter e.g. 12.03.1958 or 1958.')
      return
    }
    if (!this._file || !this._people.length) return
    this._saving = true
    const uploaded = await this.appState.apiPost(
      '/api/media/',
      fileWithMimeType(this._file),
      {isJson: false, dbChanged: false}
    )
    if ('error' in uploaded) return this._fail(uploaded.error)
    const transaction = [...(uploaded.data ?? [])]
    const media = uploaded.data[0].new
    const update = {...media, _class: 'Media', desc: this._desc.trim()}
    if (when.date) update.date = when.date
    const put = await this.appState.apiPut(`/api/media/${media.handle}`, update, {
      dbChanged: false,
    })
    if ('error' in put) return this._fail(put.error)
    transaction.push(...(put.data ?? []))
    for (const [index, p] of this._people.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.appState.apiGet(`/api/people/${p.handle}`)
      if ('error' in res) return this._fail(res.error)
      const {extended, profile, backlinks, formatted, ...person} = res.data
      const asProfile = this._profile && index === 0
      // eslint-disable-next-line no-await-in-loop
      const saved = await this.appState.apiPut(`/api/people/${p.handle}`, {
        _class: 'Person',
        ...person,
        media_list: withMediaRef(person.media_list, media.handle, asProfile),
      })
      if ('error' in saved) return this._fail(saved.error)
      transaction.push(...(saved.data ?? []))
    }
    fireUndo(
      this,
      this._('Photo saved'),
      transaction,
      `person/${this.focusPerson?.gramps_id ?? ''}`
    )
    this._saving = false
    fireEvent(this, 'family-dialog:close')
    return undefined
  }

  _fail(message) {
    this._saving = false
    fireEvent(this, 'grampsjs:error', {message})
  }

  render() {
    const firstName = this._people[0]?.name ?? ''
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._('New photo')}"
    >
      ${this._preview
        ? html`<img class="preview" src="${this._preview}" alt="" />`
        : html`<label class="pick">
            ${this._('Take or choose a photo')}
            <input type="file" accept="image/*" @change="${this._onFile}" />
          </label>`}
      <div class="field">
        <span>${this._('Who is in the photo?')}</span>
        <div class="chips">
          ${this._people.map(
            p => html`<button
              type="button"
              class="chip"
              aria-label="${this._('Remove %s', p.name)}"
              @click="${() => {
                this._people = this._people.filter(x => x.handle !== p.handle)
              }}"
            >
              ${p.name} ✕
            </button>`
          )}
        </div>
        <input
          class="input"
          style="margin-top:8px"
          placeholder="${this._('Add person')}"
          .value="${this._query}"
          @input="${this._search}"
        />
        ${this._results.length
          ? html`<ul class="results">
              ${this._results.map(
                o => html`<li>
                  <button type="button" @click="${() => this._addPerson(o)}">
                    ${personCard(o).name} <small>${personCard(o).years}</small>
                  </button>
                </li>`
              )}
            </ul>`
          : ''}
      </div>
      <label class="field">
        <span>${this._('When, roughly?')}</span>
        <input
          class="input"
          placeholder="${this._('e.g. 1958')}"
          .value="${this._when}"
          aria-invalid="${Boolean(this._error)}"
          @input="${e => {
            this._when = e.target.value
            this._error = ''
          }}"
        />
        ${this._error ? html`<div class="error">${this._error}</div>` : ''}
      </label>
      <label class="field">
        <span>${this._('What does it show? (optional)')}</span>
        <input
          class="input"
          .value="${this._desc}"
          @input="${e => {
            this._desc = e.target.value
          }}"
        />
      </label>
      ${firstName
        ? html`<label class="check">
            <input
              type="checkbox"
              .checked="${this._profile}"
              @change="${e => {
                this._profile = e.target.checked
              }}"
            />
            ${this._('Use as profile picture of %s', firstName)}
          </label>`
        : ''}
      <button
        class="primary"
        ?disabled="${this._saving || !this._file || !this._people.length}"
        @click="${this._save}"
      >
        ${this._('Save photo')}
      </button>
    </grampsjs-family-dialog>`
  }
}

window.customElements.define('grampsjs-family-photo', GrampsjsFamilyPhoto)
```

Vor dem Schreiben prüfen: `grep -n "export function fileWithMimeType" src/util.js` – muss existieren (laut Recherche util.js:720).

- [ ] **Step 7: Onboarding**

```js
// src/family/GrampsjsFamilyOnboarding.js
// First login: find the account's own person by name, or add it.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {searchPeopleUrl} from './familyApi.js'
import {matchPeopleByName, setOnboardingDone} from './me.js'
import {personCard} from './personCard.js'
import {buildNewPerson, GENDER} from './personPayload.js'
import {ensurePlaces} from './saveHelpers.js'
import {emptyValues} from './GrampsjsFamilyPersonForm.js'
import './GrampsjsFamilyDialog.js'
import './GrampsjsFamilyPersonForm.js'

class GrampsjsFamilyOnboarding extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .option {
          display: block;
          width: 100%;
          min-height: 56px;
          text-align: left;
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          background: var(--fm-card);
          padding: 8px 14px;
          margin-bottom: 8px;
          cursor: pointer;
        }
        .option b {
          font-family: var(--fm-font-name);
          font-weight: 600;
        }
        .option small {
          display: block;
          color: var(--fm-muted);
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      force: {type: Boolean},
      _state: {state: true},
      _candidates: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.force = false
    this._state = 'loading'
    this._candidates = []
    this._saving = false
  }

  async updated(changed) {
    if (changed.has('open') && this.open) await this._find()
  }

  get _fullName() {
    return this.appState.user?.full_name || this.appState.user?.name || ''
  }

  async _find() {
    this._state = 'loading'
    const res = await this.appState.apiGet(
      searchPeopleUrl(this._fullName, this.appState.settings?.lang || 'en')
    )
    const people = 'error' in res ? [] : (res.data ?? []).map(r => r.object)
    const {exact, partial} = matchPeopleByName(people, this._fullName)
    if (exact.length === 1 && !this.force) {
      await this._choose(exact[0].handle, personCard(exact[0]).name)
      return
    }
    this._candidates = [...exact, ...partial]
    this._state = this._candidates.length ? 'choose' : 'none'
  }

  async _choose(handle, name) {
    const res = await this.appState.apiPut('/api/users/-/person/', {handle}, {
      dbChanged: false,
    })
    if ('error' in res) {
      fireEvent(this, 'grampsjs:error', {message: res.error})
      return
    }
    setOnboardingDone(this.appState.user?.name)
    if (name) {
      fireEvent(this, 'grampsjs:notification', {
        message: this._('You are linked to %s.', name),
      })
    }
    fireEvent(this, 'family-onboarding:done', {handle})
  }

  _later() {
    setOnboardingDone(this.appState.user?.name)
    fireEvent(this, 'family-onboarding:done', {handle: ''})
  }

  async _addMe(e) {
    this._saving = true
    const places = await ensurePlaces(this.appState, e.detail.values)
    if ('error' in places) return this._fail(places.error)
    const objects = buildNewPerson({...places.values, gender: e.detail.values.gender})
    const res = await this.appState.apiPost('/api/objects/', objects)
    if ('error' in res) return this._fail(res.error)
    this._saving = false
    await this._choose(objects[0].handle, '')
    return undefined
  }

  _fail(message) {
    this._saving = false
    fireEvent(this, 'grampsjs:error', {message})
  }

  _initial() {
    const [given = '', ...rest] = this._fullName.trim().split(/\s+/)
    return {...emptyValues(), given, surname: rest.join(' ')}
  }

  _body() {
    if (this._state === 'loading') return html`<p>${this._('Loading')}</p>`
    if (this._state === 'add') {
      return html`<grampsjs-family-person-form
        .appState="${this.appState}"
        mode="add"
        .values="${this._initial()}"
        .genderChoice="${[
          {gender: GENDER.FEMALE, label: this._('Woman')},
          {gender: GENDER.MALE, label: this._('Man')},
        ]}"
        ?saving="${this._saving}"
        @family-form:submit="${this._addMe}"
      ></grampsjs-family-person-form>`
    }
    const actions = html`<div class="actions">
      <button class="secondary" @click="${() => {
        this._state = 'add'
      }}">${this._('Add me')}</button>
      <button class="secondary" @click="${this._later}">${this._('Later')}</button>
    </div>`
    if (this._state === 'none') {
      return html`<p>${this._('You are not in the tree yet.')}</p>${actions}`
    }
    return html`<p>${this._('Which person are you?')}</p>
      ${this._candidates.map(o => {
        const card = personCard(o)
        return html`<button class="option" @click="${() => this._choose(o.handle, card.name)}">
          <b>${card.name}</b><small>${card.years}</small>
        </button>`
      })}
      ${actions}`
  }

  render() {
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._('Welcome!')}"
      @family-dialog:close="${this._later}"
    >
      ${this._body()}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-onboarding',
  GrampsjsFamilyOnboarding
)
```

Hinweis: `grampsjs:notification` ist der vorhandene Snackbar-Weg (GrampsJs.js hört darauf).

- [ ] **Step 8: Lint, Tests, Build, Commit**

```bash
npx --no-install prettier --write src/family/*.js test/unit/familySaveHelpers.test.js
npx --no-install eslint src/family
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build 2>&1 | tail -1
git add src/family test/unit/familySaveHelpers.test.js
git commit -m "Add family mode flows: add person, edit, photo, onboarding"
```
Expected: alle Tests grün, Build ok.

---

### Task 10: In App, Leinwand und Details einbinden

**Files:**
- Modify: `src/family/GrampsjsFamilyApp.js`, `src/family/GrampsjsFamilyCanvas.js`, `src/family/GrampsjsFamilyDetails.js`
- Modify: `lang/en.json`, `lang/de.json`

**Interfaces:**
- Consumes: alle Abläufe aus Task 9; `kinship`, `relationUrls`, `myPersonHandle`, `onboardingDone` (Task 7); `layoutNeighborhood(..., {ghosts})`, `loader.reload()` (Task 2).
- Produces: Leinwand feuert `family:add` mit `{relation: 'parent' | 'child'}`; Details feuern `family:action` mit `{action: 'add' | 'edit' | 'photo'}`.

- [ ] **Step 1: Leinwand – Platzhalter rendern**

In `GrampsjsFamilyCanvas.js`:
- CSS ergänzen:

```css
        .card.ghost {
          border: 2px dashed var(--fm-add);
          background: var(--fm-add-tint);
          color: var(--fm-add);
          font-weight: 700;
          justify-content: center;
        }
```

- In `_renderCard(node)` direkt nach der `label`-Weiche:

```js
    if (node.kind === 'ghost') {
      const text =
        node.relation === 'parent' ? this._('+ Mother or father') : this._('+ Child')
      return html`<button
        class="card ghost"
        style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px"
        @click="${e => {
          if (isTap(e, this._moved)) {
            fireEvent(this, 'family:add', {relation: node.relation})
          }
        }}"
      >
        ${text}
      </button>`
    }
```

- [ ] **Step 2: Details – Verwandtschaft und Aktionen**

In `GrampsjsFamilyDetails.js`:
- Properties ergänzen: `kinship: {type: Object}`, `isMe: {type: Boolean}`, `canAdd: {type: Boolean}`, `canEdit: {type: Boolean}`; Konstruktor: `this.kinship = null; this.isMe = false; this.canAdd = false; this.canEdit = false`.
- Import `fireEvent` aus `../util.js`.
- CSS ergänzen:

```css
        .kin {
          background: var(--fm-leaf);
          border-radius: 14px;
          padding: 10px 14px;
          margin-bottom: 14px;
        }
        .kin strong {
          display: block;
        }
        .kin small {
          color: var(--fm-muted);
        }
        .actions {
          display: grid;
          gap: 8px;
          margin-top: 16px;
        }
        .actions button {
          min-height: 46px;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          background: var(--fm-leaf);
          color: var(--fm-ink);
          cursor: pointer;
        }
        .actions .add {
          background: var(--fm-add);
          color: #fff;
        }
        @media (max-width: 991px) {
          :host(:not([expanded])) .kin {
            display: none;
          }
          .actions {
            grid-template-columns: 1fr 1fr;
          }
          .actions .add {
            grid-column: 1 / -1;
          }
        }
```

- In `render()` nach `<div class="years">…</div>` einfügen:

```js
      ${this.isMe
        ? html`<div class="kin"><strong>${this._('This is you')}</strong></div>`
        : this.kinship?.relation
        ? html`<div class="kin">
            <strong>${this.kinship.relation}</strong>
            ${this.kinship.ancestors.length
              ? html`<small
                  >${this._('Common ancestors: %s', this.kinship.ancestors.join(', '))}</small
                >`
              : ''}
          </div>`
        : ''}
```

- Nach `</dl>`:

```js
      ${this.canAdd || this.canEdit
        ? html`<div class="actions">
            ${this.canAdd
              ? html`<button class="add" @click="${() => this._action('add')}">
                  ${this._('Add person')}
                </button>`
              : ''}
            ${this.canAdd
              ? html`<button @click="${() => this._action('photo')}">
                  ${this._('Upload photo')}
                </button>`
              : ''}
            ${this.canEdit
              ? html`<button @click="${() => this._action('edit')}">
                  ${this._('Edit details')}
                </button>`
              : ''}
          </div>`
        : ''}
```

- Methode: `_action(action) { fireEvent(this, 'family:action', {action}) }`

Hinweis: Auf dem Handy sind die Aktionen auch im eingeklappten Blatt sichtbar (nur `dl` und `.kin` werden eingeklappt).

- [ ] **Step 3: App – Zustand, Laden, Dialoge**

In `GrampsjsFamilyApp.js`:
- Imports:

```js
import {kinship as buildKinship} from './kinship.js'
import {relationUrls} from './familyApi.js'
import {myPersonHandle, onboardingDone} from './me.js'
import './GrampsjsFamilyAddPerson.js'
import './GrampsjsFamilyEditPerson.js'
import './GrampsjsFamilyPhoto.js'
import './GrampsjsFamilyOnboarding.js'
```

  (`relationUrls` zum bestehenden `./familyApi.js`-Import hinzufügen statt doppelt zu importieren.)
- Properties: `_dialog: {state: true}` (`'' | 'add' | 'edit' | 'photo' | 'onboarding'`), `_preset: {state: true}`, `_kinship: {state: true}`, `_onboardingForce: {state: true}`; Konstruktor: `this._dialog = ''; this._preset = ''; this._kinship = null; this._onboardingForce = false; this._kinshipFor = ''; this._onDbChanged = () => this._loader.reload()`.
- `connectedCallback`: zusätzlich `window.addEventListener('db:changed', this._onDbChanged)`; `disconnectedCallback`: entfernen.
- `LayoutCache`-Builder auf Platzhalter umstellen:

```js
    this._layoutCache = new LayoutCache((graph, focus, orientation) =>
      layoutNeighborhood(buildNeighborhood(graph, focus), orientation, {
        ghosts: Boolean(this.appState?.permissions?.canAdd),
      })
    )
```

- `_myGrampsId()`: `const handle = myPersonHandle(this.appState.treeConfig, this.appState.user?.name)` statt der bisherigen Zeilen.
- Onboarding-Weiche in `updated(changed)` am Ende ergänzen:

```js
    const username = this.appState.user?.name
    if (
      username &&
      !this._dialog &&
      !myPersonHandle(this.appState.treeConfig, username) &&
      !onboardingDone(username)
    ) {
      this._onboardingForce = false
      this._dialog = 'onboarding'
    }
```

- Verwandtschaft nach jedem Laden: Im Loader-Listener nach dem Setzen von `_focus` `this._loadKinship()` aufrufen; Methode:

```js
  async _loadKinship() {
    const me = myPersonHandle(this.appState.treeConfig, this.appState.user?.name)
    const focus = this._focus
    this._kinship = null
    if (!me || !focus || me === focus) return
    const urls = relationUrls(me, focus, this._locale)
    const [one, all] = await Promise.all([
      this.appState.apiGet(urls.one),
      this.appState.apiGet(urls.all),
    ])
    if (this._focus !== focus) return
    const names = new Map(
      (this._graph?.people() ?? []).map(p => [p.handle, personCard(p).name])
    )
    this._kinship = buildKinship(
      'error' in one ? undefined : one.data,
      'error' in all ? undefined : all.data,
      h => names.get(h) ?? ''
    )
  }
```

- Konto-Menü: vor „Log out“ ergänzen:

```js
            <button
              @click="${() => {
                this._menuOpen = false
                this._onboardingForce = true
                this._dialog = 'onboarding'
              }}"
            >
              ${this._('This is not me')}
            </button>
```

- `render()`: an `<grampsjs-family-canvas>` `@family:add="${e => this._openAdd(e.detail.relation)}"` ergänzen; an `<grampsjs-family-details>` ergänzen:

```js
            .kinship="${this._kinship}"
            ?isMe="${this._focus ===
            myPersonHandle(this.appState.treeConfig, this.appState.user?.name)}"
            ?canAdd="${this.appState.permissions?.canAdd}"
            ?canEdit="${this.appState.permissions?.canEdit}"
            @family:action="${this._onAction}"
```

  und am Ende von `render()` (nach den Details):

```js
      <grampsjs-family-add-person
        .appState="${this.appState}"
        .open="${this._dialog === 'add'}"
        .focusPerson="${this._graph?.person(this._focus) ?? null}"
        .graph="${this._graph}"
        .preset="${this._preset}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-add-person>
      <grampsjs-family-edit-person
        .appState="${this.appState}"
        .open="${this._dialog === 'edit'}"
        .handle="${this._focus}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-edit-person>
      <grampsjs-family-photo
        .appState="${this.appState}"
        .open="${this._dialog === 'photo'}"
        .focusPerson="${this._graph?.person(this._focus) ?? null}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-photo>
      <grampsjs-family-onboarding
        .appState="${this.appState}"
        .open="${this._dialog === 'onboarding'}"
        .force="${this._onboardingForce}"
        @family-onboarding:done="${this._onboarded}"
      ></grampsjs-family-onboarding>
```

- Methoden:

```js
  _openAdd(relation = '') {
    this._preset = relation
    this._dialog = 'add'
  }

  _onAction(e) {
    if (e.detail.action === 'add') this._openAdd('')
    else this._dialog = e.detail.action
  }

  _closeDialog() {
    this._dialog = ''
  }

  async _onboarded(e) {
    this._dialog = ''
    if (!e.detail.handle) return
    // refresh tree config so "To me" and kinship know the link
    const res = await this.appState.apiGet('/api/trees/-/config')
    if ('data' in res) this.appState.cacheTreeConfig(res.data)
    this._toMe()
  }
```

Hinweis: Das Hinzufügen-Formular braucht den Fokus mit `extended.families`/`primary_parent_family` – die Graph-Personen kommen mit genau diesem `extend` (Schritt 1, `familyApi.js`).

- [ ] **Step 4: Übersetzungen**

```bash
python3 - <<'EOF'
import json, re
new = {
  'Close': 'Schließen', 'Search place': 'Ort suchen', 'New place': 'Neuer Ort',
  'With whom?': 'Mit wem?', 'someone else': 'anderer', 'First name': 'Vorname',
  'Last name': 'Nachname', 'Do you mean this person?': 'Meinst du diese Person?',
  'Link': 'Verknüpfen', 'Birth name': 'Geburtsname', 'Born on': 'Geboren am',
  'Born in': 'Geboren in', 'Still alive': 'Lebt noch', 'Died on': 'Gestorben am',
  'Died in': 'Gestorben in', 'More details': 'Weitere Angaben', 'Call name': 'Rufname',
  'Occupation': 'Beruf', 'Add a memory': 'Erinnerung hinzufügen',
  'Save changes': 'Änderungen speichern', 'Add person': 'Person hinzufügen',
  'Please enter e.g. 12.03.1958 or 1958.': 'Bitte z. B. 12.03.1958 oder 1958 eingeben.',
  'Please enter a name.': 'Bitte einen Namen eingeben.',
  'e.g. 12.03.1958 or 1958': 'z. B. 12.03.1958 oder 1958',
  'Whom would you like to add?': 'Wen möchtest du hinzufügen?',
  'Mother or father': 'Mutter oder Vater', 'Both are already known': 'Beide schon eingetragen',
  'Partner': 'Partner', 'Marriage or partnership': 'Ehe oder Partnerschaft',
  'Child': 'Kind', 'Son or daughter': 'Sohn oder Tochter', 'Sibling': 'Geschwister',
  'Brother or sister': 'Bruder oder Schwester', 'Mother': 'Mutter', 'Father': 'Vater',
  'Daughter': 'Tochter', 'Son': 'Sohn', 'Sister': 'Schwester', 'Brother': 'Bruder',
  'Woman': 'Frau', 'Man': 'Mann', 'Back': 'Zurück', 'Person added': 'Person hinzugefügt',
  'This person already has a mother.': 'Diese Person hat schon eine Mutter.',
  'This person already has a father.': 'Diese Person hat schon einen Vater.',
  'Changes saved': 'Änderungen gespeichert', 'Loading': 'Wird geladen',
  'New photo': 'Neues Foto', 'Take or choose a photo': 'Foto aufnehmen oder auswählen',
  'Who is in the photo?': 'Wer ist auf dem Foto?', 'Remove %s': '%s entfernen',
  'When, roughly?': 'Wann ungefähr?', 'e.g. 1958': 'z. B. 1958',
  'What does it show? (optional)': 'Was ist zu sehen? (optional)',
  'Use as profile picture of %s': 'Als Profilbild von %s verwenden',
  'Save photo': 'Foto speichern', 'Photo saved': 'Foto gespeichert',
  'You are linked to %s.': 'Du bist mit %s verbunden.', 'Add me': 'Mich hinzufügen',
  'Later': 'Später', 'You are not in the tree yet.': 'Dich gibt es noch nicht im Baum.',
  'Which person are you?': 'Welche Person bist du?', 'Welcome!': 'Willkommen!',
  '+ Mother or father': '+ Mutter oder Vater', '+ Child': '+ Kind',
  'This is you': 'Das bist du', 'Common ancestors: %s': 'Gemeinsame Vorfahren: %s',
  'Upload photo': 'Foto hochladen', 'Edit details': 'Angaben ändern',
  'This is not me': 'Das bin ich nicht',
}
gs = open('src/strings.js').read()
gramps = [k for k in new if re.search(r"^\s*['\"]" + re.escape(k) + r"['\"],?\s*$", gs, re.M)]
print('gramps strings (skipped):', gramps)
for f, ind, de in [('lang/en.json', 2, False), ('lang/de.json', 4, True)]:
    d = json.load(open(f))
    for k, v in new.items():
        if k in gramps:
            continue
        d.setdefault(k, v if de else k)
    open(f, 'w').write(json.dumps(d, ensure_ascii=False, indent=ind) + '\n')
EOF
```

- [ ] **Step 5: Lint, Tests, Build, Commit**

```bash
npx --no-install prettier --write src/family/*.js
npx --no-install eslint src/family
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build 2>&1 | tail -1
git add src/family lang/en.json lang/de.json
git commit -m "Wire add, edit, photo, onboarding and kinship into family mode"
```

---

### Task 11: Admin – Spalten „Oberfläche“ und „Person“

**Files:**
- Modify: `src/components/GrampsjsUsers.js`
- Modify: `lang/en.json`, `lang/de.json`

**Interfaces:**
- Consumes: `TREE_CONFIG_UI_MODES`, `TREE_CONFIG_USER_PERSONS` (Schritt 1, `uiMode.js`), `appState.updateTreeConfig(patch)`, `PUT /api/users/<name>/person/` (Task 1), `<grampsjs-form-select-object objectType="person">` (feuert `select-object:changed` mit `{objects: [{handle, …}]}`).

- [ ] **Step 1: Implementierung**

In `src/components/GrampsjsUsers.js`:
- Imports:

```js
import './GrampsjsFormSelectObject.js'
import {
  TREE_CONFIG_UI_MODES,
  TREE_CONFIG_USER_PERSONS,
} from '../family/uiMode.js'
```

- Properties: `_personNames: {state: true}`; Konstruktor `this._personNames = {}`.
- Methoden:

```js
  updated(changed) {
    if (super.updated) super.updated(changed)
    if (changed.has('data') || changed.has('appState')) this._loadPersonNames()
  }

  async _loadPersonNames() {
    const links = this.appState?.treeConfig?.[TREE_CONFIG_USER_PERSONS] ?? {}
    const handles = [...new Set(Object.values(links))].filter(
      h => !(h in this._personNames)
    )
    if (!handles.length) return
    const res = await this.appState.apiGet(
      `/api/people/?handles=${handles.join(',')}&profile=self&keys=handle,profile`
    )
    if ('error' in res) return
    const names = {...this._personNames}
    for (const p of res.data ?? []) {
      names[p.handle] = `${p.profile?.name_given ?? ''} ${
        p.profile?.name_surname ?? ''
      }`.trim()
    }
    this._personNames = names
  }

  async _setUiMode(username, mode) {
    const modes = {...(this.appState.treeConfig?.[TREE_CONFIG_UI_MODES] ?? {})}
    if (mode) modes[username] = mode
    else delete modes[username]
    const res = await this.appState.updateTreeConfig({[TREE_CONFIG_UI_MODES]: modes})
    if (res && 'error' in res) fireEvent(this, 'grampsjs:error', {message: res.error})
  }

  async _setPerson(username, handle) {
    const res = await this.appState.apiPut(
      `/api/users/${encodeURIComponent(username)}/person/`,
      {handle},
      {dbChanged: false}
    )
    if ('error' in res) {
      fireEvent(this, 'grampsjs:error', {message: res.error})
      return
    }
    const config = await this.appState.apiGet('/api/trees/-/config')
    if ('data' in config) this.appState.cacheTreeConfig(config.data)
  }
```

- Kopfzeile: nach `<th>${this._('Account Source')}</th>` ergänzen:

```js
          <th>${this._('Interface')}</th>
          <th>${this._('Person')}</th>
```

- Zeile: nach `<td>${obj.account_source || this._('Password')}</td>` ergänzen:

```js
              <td>
                ${(() => {
                  const mode =
                    this.appState?.treeConfig?.[TREE_CONFIG_UI_MODES]?.[obj.name] ?? ''
                  // ?selected on the options: a .value on <select> is set before
                  // Lit renders the options and would be lost
                  return html`<select
                    aria-label="${this._('Interface')}"
                    @change="${e => this._setUiMode(obj.name, e.target.value)}"
                  >
                    <option value="" ?selected="${mode === ''}">
                      ${this._('Default')}
                    </option>
                    <option value="family" ?selected="${mode === 'family'}">
                      ${this._('Family mode')}
                    </option>
                    <option value="full" ?selected="${mode === 'full'}">
                      ${this._('Full view')}
                    </option>
                  </select>`
                })()}
              </td>
              <td>
                ${(() => {
                  const handle =
                    this.appState?.treeConfig?.[TREE_CONFIG_USER_PERSONS]?.[obj.name]
                  return handle
                    ? html`${this._personNames[handle] ?? '…'}
                        <md-icon-button
                          aria-label="${this._('Remove link')}"
                          @click="${() => this._setPerson(obj.name, '')}"
                        >
                          <grampsjs-icon
                            path="${mdiLinkOff}"
                            height="18"
                            width="18"
                            color="var(--grampsjs-body-font-color-50)"
                          ></grampsjs-icon>
                        </md-icon-button>`
                    : html`<grampsjs-form-select-object
                        objectType="person"
                        .appState="${this.appState}"
                        label="${this._('Select')}"
                        @select-object:changed="${e => {
                          const picked = e.detail.objects?.[0]
                          if (picked) this._setPerson(obj.name, picked.handle)
                        }}"
                      ></grampsjs-form-select-object>`
                })()}
              </td>
```

- `mdiLinkOff` zum bestehenden `@mdi/js`-Import hinzufügen.

- [ ] **Step 2: Übersetzungen**

```bash
python3 - <<'EOF'
import json, re
new = {'Interface': 'Oberfläche', 'Default': 'Standard', 'Family mode': 'Familien-Modus',
       'Full view': 'Volle Ansicht', 'Remove link': 'Verknüpfung entfernen', 'Select': 'Auswählen'}
gs = open('src/strings.js').read()
gramps = [k for k in new if re.search(r"^\s*['\"]" + re.escape(k) + r"['\"],?\s*$", gs, re.M)]
print('gramps strings (skipped):', gramps)
for f, ind, de in [('lang/en.json', 2, False), ('lang/de.json', 4, True)]:
    d = json.load(open(f))
    for k, v in new.items():
        if k not in gramps:
            d.setdefault(k, v if de else k)
    open(f, 'w').write(json.dumps(d, ensure_ascii=False, indent=ind) + '\n')
EOF
```

- [ ] **Step 3: Lint, Tests, Build, Commit**

```bash
npx --no-install prettier --write src/components/GrampsjsUsers.js
npx --no-install eslint src/components/GrampsjsUsers.js
npm test 2>&1 | grep -E "Test Files|Tests "
npm run build 2>&1 | tail -1
git add src/components/GrampsjsUsers.js lang/en.json lang/de.json
git commit -m "Add interface and person columns to user management"
```

---

### Task 12: Prüfung im laufenden Stack, Screenshots, README

**Files:** nur Fehlerkorrekturen aus der Prüfung (eigene Commits „Fix …“), `images/family-mode-*.png`, `README.md`.

- [ ] **Step 1: Stack mit beiden Branches bauen und Testdaten anlegen**

```bash
cd deploy && echo "GRAMPSWEB_SHARE_KEY=testkey123" > .env && docker compose up -d --build
docker compose exec -T api sh -c 'cd /app/src; export GRAMPSWEB_SECRET_KEY=$(cat /app/secret/secret); python3 -m gramps_webapi --config /app/config/config.cfg user add owner owner123 --role 4 --fullname Owner'
```

Beispieldaten über die API importieren (Owner-Token, `POST /api/importers/gramps/file` mit `/venv/share/doc/gramps/example/gramps/example.gramps`, wie im Schritt-1-Testlauf).

- [ ] **Step 2: Prüfen (Playwright, PC 1280×800 und Handy 390×844)**
  - Share-Link mit Namen „Lewis Anderson Garner von Zieliński“ → Onboarding verknüpft automatisch, Hinweis „Du bist mit … verbunden“, „Zu mir“ springt zu ihm. Mit „Max Garner“ → Auswahl bzw. „Dich gibt es noch nicht“ → „Mich hinzufügen“.
  - Bei einem Kind: Details zeigen Verwandtschaft („Sohn“) und gemeinsame Vorfahren.
  - „+ Kind“ an einer Person mit zwei Ehen → „Mit wem?“, Speichern, Kind erscheint in der richtigen Gruppe, Snackbar mit „Rückgängig“ entfernt es wieder.
  - „+ Mutter oder Vater“ bei fehlendem Elternteil; zweiter Versuch für besetzten Platz zeigt Fehlermeldung.
  - Neuer Ort „Testhausen“ → wird angelegt und angezeigt.
  - Dublette: Vorname/Nachname einer existierenden Person tippen → „Meinst du diese Person?“ → Verknüpfen.
  - Angaben ändern: Geburtsdatum `31.02.1950` → Fehlermeldung; `um 1900` → gespeichert; Beruf, Rufname, Erinnerung speichern; „Lebt noch“ an/aus.
  - Foto hochladen (beliebiges PNG), zweite Person markieren, als Profilbild → erscheint auf der Karte.
  - Owner: Benutzerverwaltung → Spalte „Oberfläche“ auf „Volle Ansicht“ für den Share-Account → nach Neuladen sieht er die volle UI; „Person“ verknüpfen/entfernen.
  - Dunkelmodus (Einstellung „Dunkel“) → Fokus-Karte lesbar.

- [ ] **Step 3: Screenshots erneuern** – `images/family-mode-desktop.png` (Person mit Details und Aktionen) und `images/family-mode-phone.png`; README-Absatz um „Personen ergänzen, Angaben ändern, Fotos hochladen“ erweitern.

- [ ] **Step 4: Aufräumen, Commit, Push beider Branches**

```bash
docker compose down -v && rm .env && cd ..
git add images README.md && git commit -m "Update family mode screenshots and README"
git push origin family-mode
cd ../gramps-web-api && git push -u origin family-mode && cd ../gramps-web
```
