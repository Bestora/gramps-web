// The shortest way between two people over parents, children and partners,
// for the guide line on the canvas and "how we are related" in the details.

function neighbours(graph, handle) {
  const result = []
  for (const family of graph.parentFamilies(handle)) {
    for (const parent of [family.father_handle, family.mother_handle]) {
      if (parent) result.push({handle: parent, via: 'parent'})
    }
  }
  for (const family of graph.partnerFamilies(handle)) {
    if (family.father_handle !== handle && family.mother_handle !== handle) {
      continue
    }
    const partner =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle
    if (partner) result.push({handle: partner, via: 'partner'})
  }
  for (const child of graph.children(handle)) {
    result.push({handle: child, via: 'child'})
  }
  return result
}

// Breadth-first search; returns [{handle, via}] from `from` to `to`, where
// `via` says how a step is related to the one before it, or [] if there is
// no connection
export function findPath(graph, from, to) {
  if (!from || !to || !graph.person(from) || !graph.person(to)) return []
  const previous = new Map([[from, null]])
  const queue = [from]
  while (queue.length) {
    const current = queue.shift()
    if (current === to) break
    for (const next of neighbours(graph, current)) {
      if (!previous.has(next.handle) && graph.person(next.handle)) {
        previous.set(next.handle, {from: current, via: next.via})
        queue.push(next.handle)
      }
    }
  }
  if (!previous.has(to)) return []
  const path = []
  for (let h = to; h !== from; h = previous.get(h).from) {
    path.unshift({handle: h, via: previous.get(h).via})
  }
  return [{handle: from, via: null}, ...path]
}

const ROLES = {
  parent: ['mother', 'father', 'parent'],
  child: ['daughter', 'son', 'child'],
  partner: ['wife', 'husband', 'partner'],
}

// Gramps genders: 0 female, 1 male, anything else unknown
export function stepRole(via, gender) {
  const [female, male, neutral] = ROLES[via]
  if (gender === 0) return female
  if (gender === 1) return male
  return neutral
}

// Centres of the cards of `handles` that are on the canvas, in path order;
// [] when fewer than two are there, as a single point draws no line
export function pathPoints(layout, handles) {
  const cards = new Map(
    layout.nodes.filter(n => n.kind !== 'label').map(n => [n.handle, n])
  )
  const points = handles
    .map(h => cards.get(h))
    .filter(Boolean)
    .map(n => [n.x + n.w / 2, n.y + n.h / 2])
  return points.length > 1 ? points : []
}

// Names for relatives by marriage, which Gramps does not name; steps are
// [{via, gender}] as from findPath plus the gender of each person.
// Returns a key such as 'father-in-law', or '' when there is none.
const IN_LAW = {
  partner: ['wife', 'husband'],
  'partner parent': ['mother-in-law', 'father-in-law'],
  'child partner': ['daughter-in-law', 'son-in-law'],
  'parent child partner': ['sister-in-law', 'brother-in-law'],
  'partner parent child': ['sister-in-law', 'brother-in-law'],
  'parent partner': ['stepmother', 'stepfather'],
  'partner child': ['stepdaughter', 'stepson'],
}

export function inLawRelation(steps) {
  const way = steps
    .slice(1)
    .map(step => step.via)
    .join(' ')
  const names = IN_LAW[way]
  const gender = steps.at(-1)?.gender
  if (!names || (gender !== 0 && gender !== 1)) return ''
  return names[gender]
}
