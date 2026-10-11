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
