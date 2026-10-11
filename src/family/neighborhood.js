// src/family/neighborhood.js
// The part of the tree the family canvas shows around one focus person.

const parentsOf = (graph, handle) => {
  const {father, mother} = graph.parents(handle)
  return {father: father || null, mother: mother || null}
}

const noParents = {father: null, mother: null}

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
        children: (family.child_ref_list || []).map(({ref}) => ({
          handle: ref,
          childCount: graph.children(ref).length,
        })),
      }
    })
  return {
    focus: focusHandle,
    parents,
    grandparents: {
      paternal: parents.father ? parentsOf(graph, parents.father) : noParents,
      maternal: parents.mother ? parentsOf(graph, parents.mother) : noParents,
    },
    partners,
  }
}
