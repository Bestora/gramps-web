// src/family/kinship.js
// "deine Großtante" and the shared ancestors of two people.
export function kinship(one, all, nameOf) {
  const first = Array.isArray(all) ? all[0] ?? {} : {}
  return {
    relation: one?.relationship_string || first.relationship_string || '',
    ancestors: (first.common_ancestors ?? []).map(nameOf).filter(Boolean),
  }
}
