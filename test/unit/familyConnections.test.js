import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {connectionsOf} from '../../src/family/connections.js'

const ref = handle => ({ref: handle})
const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref),
})
const person = (handle, given, {parents, families = []} = {}) => ({
  handle,
  gramps_id: handle,
  profile: {name_given: given, name_surname: 'R'},
  extended: {primary_parent_family: parents, families},
})

const fP = fam('fP', 'H', 'E', ['D', 'K'])
const fD = fam('fD', 'D', 'X', ['C'])
const fSolo = fam('fSolo', 'D', '', [])
const graph = new FamilyGraph([
  person('D', 'Dennis', {parents: fP, families: [fD, fSolo]}),
  person('H', 'Holger'),
  person('E', 'Evelyn'),
  person('X', 'Xenia'),
  person('C', 'Clara', {parents: fD}),
])

describe('connectionsOf', () => {
  it('lists parents, partners and children with what unlinking needs', () => {
    expect(connectionsOf(graph, 'D')).toEqual([
      {
        kind: 'parents',
        familyHandle: 'fP',
        handle: 'D',
        name: 'Holger R, Evelyn R',
      },
      {kind: 'partner', familyHandle: 'fD', handle: 'X', name: 'Xenia R'},
      {kind: 'child', familyHandle: 'fD', handle: 'C', name: 'Clara R'},
    ])
  })

  it('has nothing for a person without relatives', () => {
    expect(connectionsOf(new FamilyGraph([person('Z', 'Zoe')]), 'Z')).toEqual(
      []
    )
  })
})
