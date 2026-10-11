import {describe, it, expect} from 'vitest'
import {
  RELATION,
  canAddParent,
  parentRole,
  checkRelative,
  linkRelative,
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
function fakeAppState({person, families = {}}) {
  const calls = []
  return {
    calls,
    apiGet: async url => {
      calls.push({method: 'GET', url})
      if (url.startsWith('/api/people/')) return {data: person}
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
  it('adds a child to the chosen marriage using fresh data and If-Match', async () => {
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
    expect(put.options.ifMatch).toBe('"e-fZ"')
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
    expect(put.options.ifMatch).toBe('"e-fP"')
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
