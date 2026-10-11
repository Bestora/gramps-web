// src/family/relatives.js
// Links a newly created or existing person to the focus person.
import {linkParent, linkSpouse} from '../util/familyLinks.js'

export const RELATION = {
  PARENT: 'parent',
  PARTNER: 'partner',
  CHILD: 'child',
  SIBLING: 'sibling',
}

const clean = ({extended, profile, backlinks, formatted, ...rest}) => rest
const childRef = ref => ({_class: 'ChildRef', ref})
const parentFamily = person => person.extended?.primary_parent_family

export function canAddParent(focusPerson) {
  const family = parentFamily(focusPerson)
  return !family?.father_handle || !family?.mother_handle
}

export function parentRole(focusPerson, gender) {
  const family = parentFamily(focusPerson)
  const free = role => !family?.[`${role}_handle`]
  if (gender === 0) return free('mother') ? 'mother' : null
  if (gender === 1) return free('father') ? 'father' : null
  if (free('mother')) return 'mother'
  return free('father') ? 'father' : null
}

const addChild = (appState, family, handle) =>
  appState.apiPut(`/api/families/${family.handle}`, {
    _class: 'Family',
    ...clean(family),
    child_ref_list: [...(family.child_ref_list ?? []), childRef(handle)],
  })

async function link(
  appState,
  {relation, focusPerson, handle, gender, familyHandle}
) {
  switch (relation) {
    case RELATION.PARENT: {
      const role = parentRole(focusPerson, gender)
      if (!role) {
        return {
          error:
            gender === 0
              ? 'This person already has a mother.'
              : 'This person already has a father.',
        }
      }
      return linkParent(appState, focusPerson, handle, role)
    }
    case RELATION.PARTNER:
      return linkSpouse(appState, focusPerson, handle)
    case RELATION.CHILD: {
      const family = (focusPerson.extended?.families ?? []).find(
        f => f.handle === familyHandle
      )
      if (family) return addChild(appState, family, handle)
      const slot = focusPerson.gender === 0 ? 'mother_handle' : 'father_handle'
      return appState.apiPost('/api/families/', {
        _class: 'Family',
        [slot]: focusPerson.handle,
        child_ref_list: [childRef(handle)],
      })
    }
    case RELATION.SIBLING: {
      const family = parentFamily(focusPerson)
      if (family?.handle) return addChild(appState, family, handle)
      return appState.apiPost('/api/families/', {
        _class: 'Family',
        child_ref_list: [childRef(focusPerson.handle), childRef(handle)],
      })
    }
    default:
      return {error: `Unknown relation ${relation}`}
  }
}

export async function linkRelative(appState, options) {
  const res = await link(appState, options)
  if ('error' in res) return {error: res.error}
  return {transaction: res.data ?? []}
}
