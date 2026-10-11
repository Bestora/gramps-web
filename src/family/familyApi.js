// src/family/familyApi.js
// Requests used by the family UI.
import {FamilyGraph} from '../charts/model/FamilyGraph.js'

const EXTEND = 'primary_parent_family,family_list,parent_family_list'

export function neighborhoodUrl(grampsId, locale) {
  const rules = {
    function: 'or',
    rules: [
      {name: 'IsLessThanNthGenerationAncestorOf', values: [grampsId, 3]},
      {name: 'IsLessThanNthGenerationDescendantOf', values: [grampsId, 3]},
    ],
  }
  return `/api/people/?rules=${encodeURIComponent(
    JSON.stringify(rules)
  )}&locale=${locale}&profile=self&extend=${EXTEND}`
}

export async function fetchNeighborhoodGraph(apiGet, grampsId, locale) {
  const res = await apiGet(neighborhoodUrl(grampsId, locale))
  if ('error' in res) return {error: res.error}
  let people = res.data ?? []
  const focus = people.find(p => p.gramps_id === grampsId)
  if (!focus) return {error: `Person ${grampsId} not found`}
  const known = new Set(people.map(p => p.handle))
  const missing = (focus.extended?.families ?? [])
    .flatMap(f => [f.father_handle, f.mother_handle])
    .filter(h => h && !known.has(h))
  if (missing.length) {
    const partners = await apiGet(
      `/api/people/?handles=${missing.join(
        ','
      )}&locale=${locale}&profile=self&extend=${EXTEND}`
    )
    if (!('error' in partners)) people = [...people, ...(partners.data ?? [])]
  }
  return {graph: new FamilyGraph(people), focus: focus.handle}
}

export async function fetchGrampsId(apiGet, handle) {
  const res = await apiGet(`/api/people/${handle}?keys=gramps_id`)
  return 'error' in res ? '' : res.data?.gramps_id ?? ''
}

export function searchPeopleUrl(query, locale) {
  return `/api/search/?query=${encodeURIComponent(
    `${query}*`
  )}&type=person&profile=self&locale=${locale}&page=1&pagesize=8`
}

export function relationUrls(me, other, locale) {
  return {
    one: `/api/relations/${me}/${other}?locale=${locale}`,
    all: `/api/relations/${me}/${other}/all?locale=${locale}`,
  }
}

export function personUrl(handle, locale) {
  return `/api/people/${handle}?extend=event_ref_list&profile=self&locale=${locale}`
}
