// src/family/fullTree.js
// The whole tree for the family canvas: the relationship chart's Graphviz
// layout, translated into the canvas format.
import {layoutRelationships} from '../charts/layout/relationshipLayout.js'
import {familyMarkerPosition} from '../charts/familyMarker.js'

export const FULL_TREE_CARD = {w: 216, h: 60}
const PAD = 32
const PARTNER_LINE = 11

// `box` is the card size the relationship layout was made for
export function fullTreeLayout(rel, box = FULL_TREE_CARD) {
  const {w, h} = box
  const people = rel.nodes.filter(n => n.kind === 'person')
  if (!people.length) return {nodes: [], edges: [], width: 0, height: 0}
  const [, markerY] = familyMarkerPosition(h)
  const lines = rel.links.map(link => link.points)
  for (const family of rel.nodes.filter(n => n.kind === 'family')) {
    const y = family.y + markerY
    if (family.bracket) {
      const {left, right, top} = family.bracket
      lines.push([
        [family.x + left, family.y + top],
        [family.x + left, y],
        [family.x + right, y],
        [family.x + right, family.y + top],
      ])
    } else {
      lines.push([
        [family.x - PARTNER_LINE, y],
        [family.x + PARTNER_LINE, y],
      ])
    }
  }
  const xs = [...people.map(n => n.x - w / 2), ...lines.flat().map(([x]) => x)]
  const ys = [
    ...people.map(n => n.y - h / 2),
    ...lines.flat().map(([, y]) => y),
  ]
  const dx = PAD - Math.min(...xs)
  const dy = PAD - Math.min(...ys)
  const nodes = people.map(n => ({
    key: n.key,
    kind: 'person',
    handle: n.handle,
    x: n.x - w / 2 + dx,
    y: n.y - h / 2 + dy,
    w,
    h,
  }))
  const edges = lines.map(points => ({
    points: points.map(([x, y]) => [x + dx, y + dy]),
  }))
  const width = Math.max(...xs) + dx + w + PAD
  const height = Math.max(...ys) + dy + h + PAD
  return {nodes, edges, width, height}
}

// Left to right: Graphviz only lays out top to bottom, so the tree is laid
// out with upright cards (width and height swapped) and then mirrored along
// the diagonal, which turns rows of generations into columns
const transpose = ({nodes, edges, width, height}) => ({
  nodes: nodes.map(n => ({...n, x: n.y, y: n.x, w: n.h, h: n.w})),
  edges: edges.map(e => ({points: e.points.map(([x, y]) => [y, x])})),
  width: height,
  height: width,
})

export async function layoutFullTree(graph, rootHandle, orientation = 'ttb') {
  const ltr = orientation === 'ltr'
  const box = ltr ? {w: FULL_TREE_CARD.h, h: FULL_TREE_CARD.w} : FULL_TREE_CARD
  const rel = await layoutRelationships(graph, rootHandle, {
    boxWidth: box.w,
    boxHeight: box.h,
  })
  const layout = fullTreeLayout(rel, box)
  return ltr ? transpose(layout) : layout
}
