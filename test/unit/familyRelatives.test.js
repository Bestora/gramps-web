import {describe, it, expect} from 'vitest'
import {
  RELATION,
  canAddParent,
  parentRole,
  checkRelative,
  linkRelative,
  unlinkRelative,
} from '../../src/family/relatives.js'

const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({_class: 'ChildRef', ref})),
})

// Anna (female) with two marriages and a father but no mother
const annaWith = ({parents = fam('fP', 'H', '', ['A']), families} = {}) => ({
  handle: 'A',
  gender: 0,
  extended: {
    primary_parent_family: parents,
    families: families ?? [
      fam('fK', 'K', 'A', ['P']),
      fam('fZ', 'Z', 'A', ['T']),
    ],
  },
})

// The server state the fake API answers with: people and families by handle
function fakeAppState({person, people = {}, families = {}}) {
  const calls = []
  return {
    calls,
    apiGet: async url => {
      calls.push({method: 'GET', url})
      if (url.startsWith('/api/people/')) {
        const handle = url.split('/')[3].split('?')[0]
        return {data: people[handle] ?? person}
      }
      const handle = url.split('/')[3]
      const family = families[handle]
      return family
        ? {data: {...family, extended: {x: 1}}, etag: `"e-${handle}"`}
        : {error: 'not found'}
    },
    apiPut: async (url, body, options) => {
      calls.push({method: 'PUT', url, body, options})
      return {data: [{type: 'update', url}]}
    },
    apiPost: async (url, body, options) => {
      calls.push({method: 'POST', url, body, options})
      return {data: [{type: 'add', url}]}
    },
    apiDelete: async (url, options) => {
      calls.push({method: 'DELETE', url, options})
      return {data: [{type: 'delete', url}]}
    },
  }
}

const writes = appState => appState.calls.filter(c => c.method !== 'GET')

describe('parent slots', () => {
  it('knows which parent is missing', () => {
    const anna = annaWith()
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
    expect(canAddParent(annaWith({parents: fam('fP', 'H', 'E', ['A'])}))).toBe(
      false
    )
  })
})

describe('checkRelative', () => {
  it('reports a taken parent slot before anything is created', () => {
    expect(
      checkRelative(annaWith(), {relation: RELATION.PARENT, gender: 1})
    ).toBe('This person already has a father.')
    expect(
      checkRelative(annaWith(), {relation: RELATION.PARENT, gender: 0})
    ).toBe('')
  })

  it('reports a chosen family that does not exist (any more)', () => {
    expect(
      checkRelative(annaWith(), {
        relation: RELATION.CHILD,
        familyHandle: 'gone',
      })
    ).toBe('The chosen family no longer exists.')
    expect(
      checkRelative(annaWith(), {relation: RELATION.CHILD, familyHandle: ''})
    ).toBe('')
  })
})

describe('linkRelative', () => {
  it('adds a child to the chosen marriage using fresh data', async () => {
    // someone else added X to fZ since the canvas was loaded
    const appState = fakeAppState({
      person: annaWith(),
      families: {fZ: fam('fZ', 'Z', 'A', ['T', 'X'])},
    })
    const res = await linkRelative(appState, {
      relation: RELATION.CHILD,
      focusHandle: 'A',
      handle: 'L',
      familyHandle: 'fZ',
    })
    const [put] = writes(appState)
    expect(writes(appState)).toHaveLength(1)
    expect(put.url).toBe('/api/families/fZ')
    expect(put.body.child_ref_list.map(c => c.ref)).toEqual(['T', 'X', 'L'])
    expect(put.body.extended).toBeUndefined()
    expect(res.transaction).toHaveLength(1)
  })

  it('starts a new family for a child with someone else', async () => {
    const appState = fakeAppState({person: annaWith()})
    await linkRelative(appState, {
      relation: RELATION.CHILD,
      focusHandle: 'A',
      handle: 'L',
      familyHandle: '',
    })
    expect(writes(appState)[0]).toMatchObject({
      method: 'POST',
      url: '/api/families/',
      body: {
        _class: 'Family',
        mother_handle: 'A',
        child_ref_list: [{_class: 'ChildRef', ref: 'L'}],
      },
    })
  })

  it('does not create a family when the chosen one is gone', async () => {
    const appState = fakeAppState({person: annaWith()})
    const res = await linkRelative(appState, {
      relation: RELATION.CHILD,
      focusHandle: 'A',
      handle: 'L',
      familyHandle: 'gone',
    })
    expect(res.error).toBe('The chosen family no longer exists.')
    expect(writes(appState)).toHaveLength(0)
  })

  it('adds a sibling to the parent family', async () => {
    const appState = fakeAppState({
      person: annaWith(),
      families: {fP: fam('fP', 'H', '', ['A'])},
    })
    await linkRelative(appState, {
      relation: RELATION.SIBLING,
      focusHandle: 'A',
      handle: 'S',
    })
    expect(writes(appState)[0].url).toBe('/api/families/fP')
    expect(writes(appState)[0].body.child_ref_list.map(c => c.ref)).toEqual([
      'A',
      'S',
    ])
  })

  it('creates a parent family for a sibling when there is none', async () => {
    const appState = fakeAppState({
      person: {handle: 'O', gender: 1, extended: {families: []}},
    })
    await linkRelative(appState, {
      relation: RELATION.SIBLING,
      focusHandle: 'O',
      handle: 'S',
    })
    expect(writes(appState)[0]).toMatchObject({
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
    const appState = fakeAppState({
      person: annaWith(),
      families: {fP: fam('fP', 'H', '', ['A'])},
    })
    await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusHandle: 'A',
      handle: 'M',
      gender: 0,
    })
    const [put] = writes(appState)
    expect(put.url).toBe('/api/families/fP')
    expect(put.body.mother_handle).toBe('M')
    expect(put.body.father_handle).toBe('H')
  })

  it('refuses a parent slot that was filled in the meantime', async () => {
    // the person still looks motherless, but the family has a mother now
    const appState = fakeAppState({
      person: annaWith(),
      families: {fP: fam('fP', 'H', 'E2', ['A'])},
    })
    const res = await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusHandle: 'A',
      handle: 'M',
      gender: 0,
    })
    expect(res.error).toBe('This person already has a mother.')
    expect(writes(appState)).toHaveLength(0)
  })

  it('creates a parent family when there is none', async () => {
    const appState = fakeAppState({
      person: {handle: 'O', gender: 1, extended: {families: []}},
    })
    await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusHandle: 'O',
      handle: 'M',
      gender: 0,
    })
    expect(writes(appState)[0]).toMatchObject({
      method: 'POST',
      body: {
        mother_handle: 'M',
        child_ref_list: [{_class: 'ChildRef', ref: 'O'}],
      },
    })
  })

  it('always adds a partner as a new family', async () => {
    // a single-parent family with a child must not get the new partner
    const appState = fakeAppState({
      person: annaWith({families: [fam('fT', '', 'A', ['Tom'])]}),
    })
    await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusHandle: 'A',
      handle: 'N',
    })
    expect(writes(appState)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/api/families/',
        body: {_class: 'Family', mother_handle: 'A', father_handle: 'N'},
      }),
    ])
  })

  it('passes API errors through', async () => {
    const appState = fakeAppState({person: annaWith()})
    appState.apiPost = async () => ({error: 'boom'})
    const res = await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusHandle: 'A',
      handle: 'N',
    })
    expect(res).toEqual({error: 'boom'})
  })

  it('reports a failed fresh read', async () => {
    const appState = fakeAppState({person: annaWith()})
    appState.apiGet = async () => ({error: 'offline'})
    const res = await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusHandle: 'A',
      handle: 'N',
    })
    expect(res).toEqual({error: 'offline'})
  })
})

describe('duplicate families', () => {
  // Dennis (D) has a mother E but no father; E and H already have an empty
  // family fDup because H was first added as E's partner
  const fP = fam('fP', '', 'E', ['D', 'K'])
  const fDup = fam('fDup', 'H', 'E', [])
  const dennis = {
    handle: 'D',
    gender: 1,
    extended: {primary_parent_family: fP, families: []},
  }
  const evelyn = {handle: 'E', gender: 0, extended: {families: [fP, fDup]}}

  it('removes the empty family of the two parents after adding a parent', async () => {
    const appState = fakeAppState({
      people: {D: dennis, E: evelyn},
      families: {fP, fDup},
    })
    const res = await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusHandle: 'D',
      handle: 'H',
      gender: 1,
    })
    expect(writes(appState).map(c => `${c.method} ${c.url}`)).toEqual([
      'PUT /api/families/fP',
      'DELETE /api/families/fDup',
    ])
    expect(res.transaction).toHaveLength(2)
  })

  it('keeps a shared family that has children or events', async () => {
    const busy = {...fDup, event_ref_list: [{ref: 'marriage'}]}
    const appState = fakeAppState({
      people: {
        D: dennis,
        E: {...evelyn, extended: {families: [fP, busy]}},
      },
      families: {fP, fDup: busy},
    })
    await linkRelative(appState, {
      relation: RELATION.PARENT,
      focusHandle: 'D',
      handle: 'H',
      gender: 1,
    })
    expect(writes(appState).map(c => c.method)).toEqual(['PUT'])
  })

  it('makes a new partner the other parent of a chosen family', async () => {
    const appState = fakeAppState({
      person: evelyn,
      families: {fP},
    })
    await linkRelative(appState, {
      relation: RELATION.PARTNER,
      focusHandle: 'E',
      handle: 'H',
      familyHandle: 'fP',
    })
    const [put] = writes(appState)
    expect(put.method).toBe('PUT')
    expect(put.url).toBe('/api/families/fP')
    expect(put.body.father_handle).toBe('H')
    expect(put.body.mother_handle).toBe('E')
  })

  it('refuses to put a partner into a family that already has two parents', () => {
    expect(
      checkRelative(evelyn, {relation: RELATION.PARTNER, familyHandle: 'fDup'})
    ).toBe('This family already has two parents.')
  })
})

describe('unlinkRelative', () => {
  const fP = fam('fP', 'H', 'E', ['D', 'K'])
  const fC = fam('fC', 'D', 'X', ['C1'])
  const fAlone = fam('fAlone', 'D', 'Y', [])

  it('takes a child out of a family and keeps the family', async () => {
    const appState = fakeAppState({families: {fC}})
    const res = await unlinkRelative(appState, {
      kind: 'child',
      familyHandle: 'fC',
      handle: 'C1',
    })
    const [put] = writes(appState)
    expect(put.url).toBe('/api/families/fC')
    expect(put.body.child_ref_list).toEqual([])
    expect(put.body.father_handle).toBe('D')
    expect(res.transaction).toHaveLength(1)
  })

  it('takes the person out of the parent family', async () => {
    const appState = fakeAppState({families: {fP}})
    await unlinkRelative(appState, {
      kind: 'parents',
      familyHandle: 'fP',
      handle: 'D',
    })
    expect(writes(appState)[0].body.child_ref_list.map(c => c.ref)).toEqual([
      'K',
    ])
  })

  it('removes a partner and deletes the family left with one person', async () => {
    const appState = fakeAppState({families: {fAlone}})
    await unlinkRelative(appState, {
      kind: 'partner',
      familyHandle: 'fAlone',
      handle: 'Y',
    })
    expect(writes(appState).map(c => `${c.method} ${c.url}`)).toEqual([
      'DELETE /api/families/fAlone',
    ])
  })

  it('keeps a family with children when a partner is removed', async () => {
    const appState = fakeAppState({families: {fC}})
    await unlinkRelative(appState, {
      kind: 'partner',
      familyHandle: 'fC',
      handle: 'X',
    })
    const [put] = writes(appState)
    expect(put.method).toBe('PUT')
    expect(put.body.mother_handle).toBe('')
    expect(put.body.father_handle).toBe('D')
  })

  it('reports a failed read', async () => {
    const appState = fakeAppState({families: {}})
    const res = await unlinkRelative(appState, {
      kind: 'child',
      familyHandle: 'gone',
      handle: 'C1',
    })
    expect(res.error).toBeTruthy()
    expect(writes(appState)).toHaveLength(0)
  })
})
