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
    links: [
      {
        points: [
          [120, 20],
          [120, 100],
          [120, 170],
        ],
      },
    ],
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
