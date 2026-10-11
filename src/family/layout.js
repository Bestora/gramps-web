// src/family/layout.js
// Grid layout of a family neighbourhood. Positions are computed along a
// generation axis (g) and a sibling axis (s) and mapped to x/y at the end,
// so both orientations share one algorithm.

export const ORIENTATION_LTR = 'ltr'
export const ORIENTATION_TTB = 'ttb'

const CARD = {w: 216, h: 60}
const SMALL = {w: 160, h: 44}
const PAD = 32
const SIB_GAP = 16
const GROUP_GAP = 28
const LABEL_EXT = 24

export function layoutNeighborhood(model, orientation = ORIENTATION_LTR) {
  const ltr = orientation !== ORIENTATION_TTB
  const ext = box => (ltr ? box.h : box.w) // size along s
  const len = box => (ltr ? box.w : box.h) // size along g
  const genGap = ltr ? 64 : 56
  const colLen = [len(SMALL), len(CARD), len(CARD), len(CARD)]
  const colStart = [0]
  for (let i = 1; i < colLen.length; i += 1) {
    colStart[i] = colStart[i - 1] + colLen[i - 1] + genGap
  }

  const items = []
  const lines = []
  const place = (key, col, center, box, extra = {}) => {
    const item = {
      key,
      g: colStart[col],
      s: center - ext(box) / 2,
      gl: len(box),
      sl: ext(box),
      ...extra,
    }
    items.push(item)
    return item
  }
  const mid = item => item.s + item.sl / 2
  const near = item => ({g: item.g, s: mid(item)})
  const far = item => ({g: item.g + item.gl, s: mid(item)})
  const elbow = (a, b) => {
    const m = (a.g + b.g) / 2
    lines.push([a, {g: m, s: a.s}, {g: m, s: b.s}, b])
  }

  // focus column: the focus person, then every partner below
  const focus = place('focus', 2, ext(CARD) / 2, CARD, {
    kind: 'focus',
    handle: model.focus,
  })
  const partnerItems = model.partners.map((p, i) => {
    const center = ext(CARD) / 2 + (i + 1) * (ext(CARD) + SIB_GAP)
    return p.partner
      ? place(`partner-${p.familyHandle}`, 2, center, CARD, {
          kind: 'partner',
          handle: p.partner,
        })
      : place(`unknown-${p.familyHandle}`, 2, center, CARD, {
          kind: 'unknown',
          handle: null,
        })
  })
  const lastPartner = partnerItems.filter(Boolean).at(-1)
  if (lastPartner) {
    const g = focus.g + focus.gl / 2
    lines.push([
      {g, s: focus.s + focus.sl},
      {g, s: lastPartner.s},
    ])
  }

  // children column, grouped by family, centred on the focus column
  const groups = model.partners
    .map((p, i) => ({p, origin: partnerItems[i] ?? focus}))
    .filter(({p}) => p.children.length)
  const labelExt = ltr ? LABEL_EXT : 0
  const groupExt = ({p}) =>
    labelExt + p.children.length * (ext(CARD) + SIB_GAP) - SIB_GAP
  const blockExt =
    groups.reduce((sum, grp) => sum + groupExt(grp), 0) +
    Math.max(groups.length - 1, 0) * GROUP_GAP
  const columnTop = focus.s
  const columnBottom = (lastPartner ?? focus).s + (lastPartner ?? focus).sl
  let cursor = (columnTop + columnBottom) / 2 - blockExt / 2
  for (const grp of groups) {
    const labelS = cursor
    items.push({
      key: `label-${grp.p.familyHandle}`,
      kind: 'label',
      handle: null,
      partner: grp.p.partner,
      g: ltr ? colStart[3] : colStart[3] - 22,
      s: labelS,
      gl: ltr ? len(CARD) : 18,
      sl: ltr ? LABEL_EXT - 4 : groupExt(grp),
    })
    cursor += labelExt
    for (const child of grp.p.children) {
      const item = place(
        `child-${child.handle}`,
        3,
        cursor + ext(CARD) / 2,
        CARD,
        {kind: 'person', handle: child.handle, childCount: child.childCount}
      )
      elbow(far(grp.origin), near(item))
      cursor += ext(CARD) + SIB_GAP
    }
    cursor += GROUP_GAP - SIB_GAP
  }

  // parents, spaced so that both grandparent pairs fit
  const fc = mid(focus)
  const pairExt = 2 * ext(SMALL) + SIB_GAP
  const parentDist = Math.max(ext(CARD), pairExt) + SIB_GAP
  const sides = [
    ['father', fc - parentDist / 2, 'paternal'],
    ['mother', fc + parentDist / 2, 'maternal'],
  ]
  for (const [role, center, side] of sides) {
    const handle = model.parents[role]
    if (!handle) continue
    const parent = place(`parent-${role}`, 1, center, CARD, {
      kind: 'person',
      handle,
    })
    elbow(far(parent), near(focus))
    const gp = model.grandparents[side]
    const offset = (ext(SMALL) + SIB_GAP) / 2
    for (const [gpRole, gpCenter] of [
      ['father', center - offset],
      ['mother', center + offset],
    ]) {
      if (!gp[gpRole]) continue
      const item = place(`gp-${side}-${gpRole}`, 0, gpCenter, SMALL, {
        kind: 'small',
        handle: gp[gpRole],
      })
      elbow(far(item), near(parent))
    }
  }

  // drop empty leading generation columns and shift into positive space
  const minG = Math.min(...items.map(i => i.g))
  const minS = Math.min(...items.map(i => i.s))
  const toXY = ({g, s}) =>
    ltr ? [g - minG + PAD, s - minS + PAD] : [s - minS + PAD, g - minG + PAD]
  const nodes = items.map(({g, s, gl, sl, ...rest}) => {
    const [x, y] = toXY({g, s})
    return {...rest, x, y, w: ltr ? gl : sl, h: ltr ? sl : gl}
  })
  const edges = lines.map(points => ({points: points.map(toXY)}))
  const width = Math.max(...nodes.map(n => n.x + n.w)) + PAD
  const height = Math.max(...nodes.map(n => n.y + n.h)) + PAD
  return {nodes, edges, width, height}
}
