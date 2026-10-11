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
