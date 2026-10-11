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
    {
      familyHandle: 'f2',
      partner: 'Z',
      children: [{handle: 'T', childCount: 1}],
    },
    {
      familyHandle: 'f3',
      partner: null,
      children: [{handle: 'X', childCount: 0}],
    },
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
      for (const h of [
        'A',
        'H',
        'E',
        'W',
        'F',
        'O',
        'L',
        'K',
        'Z',
        'P',
        'M',
        'T',
        'X',
      ]) {
        expect(handles.filter(x => x === h)).toHaveLength(1)
      }
      expect(cards(layout).filter(n => n.kind === 'unknown')).toHaveLength(1)
    })

    it('never overlaps two nodes', () => {
      const all = layout.nodes
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          expect(
            overlaps(all[i], all[j]),
            `${all[i].key} / ${all[j].key}`
          ).toBe(false)
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

describe('layoutNeighborhood ghosts', () => {
  const half = {
    ...lonely,
    parents: {father: 'H', mother: null},
    partners: [
      {
        familyHandle: 'f1',
        partner: 'K',
        children: [{handle: 'P', childCount: 0}],
      },
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
    expect(
      layout.nodes
        .map(n => n.relation)
        .filter(Boolean)
        .sort()
    ).toEqual(['child', 'parent'])
  })

  it('offers no parent placeholder when both parents are known', () => {
    const layout = layoutNeighborhood(full, ORIENTATION_LTR, {ghosts: true})
    expect(layout.nodes.filter(n => n.relation === 'parent')).toHaveLength(0)
  })
})

describe.each([ORIENTATION_LTR, ORIENTATION_TTB])(
  'layoutNeighborhood siblings (%s)',
  orientation => {
    const withSiblings = {
      ...full,
      siblings: [
        {handle: 'S1', childCount: 0},
        {handle: 'S2', childCount: 2},
      ],
    }
    const layout = layoutNeighborhood(withSiblings, orientation, {ghosts: true})
    const axis = orientation === ORIENTATION_LTR ? 'x' : 'y'
    const node = h => layout.nodes.find(n => n.handle === h)

    it('puts siblings in the generation of the person', () => {
      expect(node('S1')[axis]).toBe(node('A')[axis])
      expect(node('S2')[axis]).toBe(node('A')[axis])
      expect(node('S2').childCount).toBe(2)
    })

    it('still never overlaps two nodes', () => {
      const all = layout.nodes
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          expect(
            overlaps(all[i], all[j]),
            `${all[i].key} / ${all[j].key}`
          ).toBe(false)
        }
      }
    })

    it('connects each sibling to the parents', () => {
      // 11 lines as before, the child placeholder, and one per sibling
      expect(layout.edges).toHaveLength(14)
    })
  }
)
