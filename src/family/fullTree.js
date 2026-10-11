// src/family/fullTree.js
// The whole tree for the family canvas: the relationship chart's Graphviz
// layout, translated into the canvas format.
import {layoutRelationships} from '../charts/layout/relationshipLayout.js'
import {familyMarkerPosition} from '../charts/familyMarker.js'

export const FULL_TREE_CARD = {w: 216, h: 60}
const PAD = 32
const PARTNER_LINE = 11

export function fullTreeLayout(rel) {
  const {w, h} = FULL_TREE_CARD
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

export async function layoutFullTree(graph, rootHandle) {
  const rel = await layoutRelationships(graph, rootHandle, {
    boxWidth: FULL_TREE_CARD.w,
    boxHeight: FULL_TREE_CARD.h,
  })
  return fullTreeLayout(rel)
}
