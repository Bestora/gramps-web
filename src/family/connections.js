// The connections of a person that can be removed in the family UI.
import {personCard} from './personCard.js'

export function connectionsOf(graph, handle) {
  const name = h => personCard(graph.person(h)).name
  const connections = []
  const parents = graph.person(handle)?.extended?.primary_parent_family
  const parentNames = [parents?.father_handle, parents?.mother_handle]
    .filter(Boolean)
    .map(name)
  if (parents?.handle && parentNames.length) {
    connections.push({
      kind: 'parents',
      familyHandle: parents.handle,
      handle,
      name: parentNames.join(', '),
    })
  }
  const own = graph
    .partnerFamilies(handle)
    .filter(f => f.father_handle === handle || f.mother_handle === handle)
  for (const family of own) {
    const partner =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle
    if (partner) {
      connections.push({
        kind: 'partner',
        familyHandle: family.handle,
        handle: partner,
        name: name(partner),
      })
    }
    for (const {ref} of family.child_ref_list ?? []) {
      connections.push({
        kind: 'child',
        familyHandle: family.handle,
        handle: ref,
        name: name(ref),
      })
    }
  }
  return connections
}
