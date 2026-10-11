// src/family/neighborhood.js
// The part of the tree the family canvas shows around one focus person.

const parentsOf = (graph, handle) => {
  const {father, mother} = graph.parents(handle)
  return {father: father || null, mother: mother || null}
}

const noParents = {father: null, mother: null}

const childEntry =
  graph =>
  ({ref}) => ({
    handle: ref,
    childCount: graph.children(ref).length,
  })

// Families with the same partner (e.g. a duplicate created by mistake) are
// shown as one; the family with children is the one new children go into
function mergeByPartner(entries) {
  const merged = []
  for (const entry of entries) {
    const same = entry.partner
      ? merged.find(m => m.partner === entry.partner)
      : undefined
    if (!same) {
      merged.push({...entry})
    } else {
      if (!same.children.length && entry.children.length) {
        same.familyHandle = entry.familyHandle
      }
      same.children = [...same.children, ...entry.children]
    }
  }
  return merged
}

export function buildNeighborhood(graph, focusHandle) {
  const parents = parentsOf(graph, focusHandle)
  const partners = graph
    .partnerFamilies(focusHandle)
    .filter(
      family =>
        family.father_handle === focusHandle ||
        family.mother_handle === focusHandle
    )
    .map(family => {
      const partner =
        family.father_handle === focusHandle
          ? family.mother_handle
          : family.father_handle
      return {
        familyHandle: family.handle,
        partner: partner || null,
        children: (family.child_ref_list || []).map(childEntry(graph)),
      }
    })
  const parentFamily =
    graph.person(focusHandle)?.extended?.primary_parent_family
  const siblings = (parentFamily?.child_ref_list ?? [])
    .filter(({ref}) => ref !== focusHandle)
    .map(childEntry(graph))
  return {
    focus: focusHandle,
    parents,
    siblings,
    grandparents: {
      paternal: parents.father ? parentsOf(graph, parents.father) : noParents,
      maternal: parents.mother ? parentsOf(graph, parents.mother) : noParents,
    },
    partners: mergeByPartner(partners),
  }
}
