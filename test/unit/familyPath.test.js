import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  findPath,
  stepRole,
  pathPoints,
  inLawRelation,
  connectedPeople,
} from '../../src/family/path.js'

const ref = r => ({ref: r})
const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref),
})
const person = (handle, gender, {parents, families = []} = {}) => ({
  handle,
  gender,
  extended: {primary_parent_family: parents, families},
})

// Pedro + Maria -> Evelyn; Holger + Evelyn -> Dennis, Kim; Dennis + Lena ->
// Nora; Jörg + Ute -> Lena; Rosa is a stranger
const fG = fam('fG', 'P', 'M', ['E'])
const fP = fam('fP', 'H', 'E', ['D', 'K'])
const fD = fam('fD', 'D', 'L', ['N'])
const fX = fam('fX', 'J', 'U', ['L'])
const graph = new FamilyGraph([
  person('P', 1, {families: [fG]}),
  person('M', 0, {families: [fG]}),
  person('H', 1, {families: [fP]}),
  person('E', 0, {parents: fG, families: [fP]}),
  person('D', 1, {parents: fP, families: [fD]}),
  person('K', 0, {parents: fP}),
  person('L', 0, {parents: fX, families: [fD]}),
  person('N', 0, {parents: fD}),
  person('J', 1, {families: [fX]}),
  person('U', 0, {families: [fX]}),
  person('R', 0),
])

describe('findPath', () => {
  it('walks up to a grandparent', () => {
    expect(findPath(graph, 'D', 'P')).toEqual([
      {handle: 'D', via: null},
      {handle: 'E', via: 'parent'},
      {handle: 'P', via: 'parent'},
    ])
  })

  it('goes through the shared parent to a sibling', () => {
    expect(findPath(graph, 'D', 'K').map(s => s.handle)).toEqual([
      'D',
      'H',
      'K',
    ])
    expect(findPath(graph, 'D', 'K')[2].via).toBe('child')
  })

  it('crosses partners to in-laws', () => {
    expect(findPath(graph, 'D', 'J')).toEqual([
      {handle: 'D', via: null},
      {handle: 'L', via: 'partner'},
      {handle: 'J', via: 'parent'},
    ])
  })

  it('returns only the person for the same person, and [] if unconnected', () => {
    expect(findPath(graph, 'D', 'D')).toEqual([{handle: 'D', via: null}])
    expect(findPath(graph, 'D', 'R')).toEqual([])
    expect(findPath(graph, 'D', 'nobody')).toEqual([])
    expect(findPath(graph, '', 'D')).toEqual([])
  })
})

describe('stepRole', () => {
  it('names a step by direction and gender', () => {
    expect(stepRole('parent', 0)).toBe('mother')
    expect(stepRole('parent', 1)).toBe('father')
    expect(stepRole('parent', 2)).toBe('parent')
    expect(stepRole('child', 0)).toBe('daughter')
    expect(stepRole('child', 1)).toBe('son')
    expect(stepRole('partner', 0)).toBe('wife')
    expect(stepRole('partner', 1)).toBe('husband')
    expect(stepRole('partner', 3)).toBe('partner')
  })
})

describe('pathPoints', () => {
  const layout = {
    nodes: [
      {handle: 'A', kind: 'person', x: 0, y: 0, w: 100, h: 40},
      {handle: 'B', kind: 'focus', x: 200, y: 100, w: 100, h: 40},
      {handle: 'B', kind: 'label', x: 0, y: 0, w: 10, h: 10},
      {handle: 'C', kind: 'person', x: 400, y: 0, w: 100, h: 40},
    ],
  }
  it('joins the centres of the cards on the path that are on the canvas', () => {
    expect(pathPoints(layout, ['A', 'missing', 'B', 'C'])).toEqual([
      [50, 20],
      [250, 120],
      [450, 20],
    ])
  })
  it('needs at least two cards', () => {
    expect(pathPoints(layout, ['A'])).toEqual([])
    expect(pathPoints(layout, [])).toEqual([])
  })
})

describe('inLawRelation', () => {
  const steps = (...vias) => [
    {handle: 'me', via: null},
    ...vias.map(([via, gender], i) => ({handle: `p${i}`, via, gender})),
  ]
  it.each([
    [
      [
        ['partner', 1],
        ['parent', 1],
      ],
      'father-in-law',
    ],
    [
      [
        ['partner', 0],
        ['parent', 0],
      ],
      'mother-in-law',
    ],
    [
      [
        ['child', 0],
        ['partner', 1],
      ],
      'son-in-law',
    ],
    [
      [
        ['child', 1],
        ['partner', 0],
      ],
      'daughter-in-law',
    ],
    [
      [
        ['parent', 1],
        ['child', 0],
        ['partner', 1],
      ],
      'brother-in-law',
    ],
    [
      [
        ['partner', 0],
        ['parent', 1],
        ['child', 0],
      ],
      'sister-in-law',
    ],
    [
      [
        ['parent', 0],
        ['partner', 1],
      ],
      'stepfather',
    ],
    [
      [
        ['parent', 1],
        ['partner', 0],
      ],
      'stepmother',
    ],
    [
      [
        ['partner', 1],
        ['child', 1],
      ],
      'stepson',
    ],
    [
      [
        ['partner', 1],
        ['child', 0],
      ],
      'stepdaughter',
    ],
    [[['partner', 1]], 'husband'],
    [[['partner', 0]], 'wife'],
  ])('names %j as %s', (vias, expected) => {
    expect(inLawRelation(steps(...vias))).toBe(expected)
  })

  it('has no name for other ways', () => {
    expect(inLawRelation(steps(['parent', 1], ['parent', 0]))).toBe('')
    expect(inLawRelation([])).toBe('')
  })
})

describe('connectedPeople', () => {
  it('collects everyone reachable over parents, children and partners', () => {
    const reachable = connectedPeople(graph, 'D')
    expect([...reachable].sort()).toEqual(
      ['D', 'E', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'U'].sort()
    )
    expect(reachable.has('R')).toBe(false)
  })

  it('is empty for an unknown person', () => {
    expect(connectedPeople(graph, 'nobody').size).toBe(0)
  })
})
