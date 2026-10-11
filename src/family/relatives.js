// Links a newly created or existing person to the focus person.
import {errorMessage} from './saveHelpers.js'
//
// The focus person and any family that is changed are read fresh right
// before writing, and families are saved with If-Match, so a change made by
// someone else since the canvas was loaded is never silently overwritten.

export const RELATION = {
  PARENT: 'parent',
  PARTNER: 'partner',
  CHILD: 'child',
  SIBLING: 'sibling',
}

const clean = ({extended, profile, backlinks, formatted, ...rest}) => rest
const childRef = ref => ({_class: 'ChildRef', ref})
const parentFamily = person => person.extended?.primary_parent_family
const slotOf = person =>
  person.gender === 0 ? 'mother_handle' : 'father_handle'
const otherSlot = slot =>
  slot === 'mother_handle' ? 'father_handle' : 'mother_handle'

export function canAddParent(focusPerson) {
  const family = parentFamily(focusPerson)
  return !family?.father_handle || !family?.mother_handle
}

const roleFor = (family, gender) => {
  const free = role => !family?.[`${role}_handle`]
  if (gender === 0) return free('mother') ? 'mother' : null
  if (gender === 1) return free('father') ? 'father' : null
  if (free('mother')) return 'mother'
  return free('father') ? 'father' : null
}

export function parentRole(focusPerson, gender) {
  return roleFor(parentFamily(focusPerson), gender)
}

const takenMessage = gender =>
  gender === 0
    ? 'This person already has a mother.'
    : 'This person already has a father.'

// Problems that can be found before anything is created; '' if none
export function checkRelative(focusPerson, {relation, gender, familyHandle}) {
  if (relation === RELATION.PARENT && !parentRole(focusPerson, gender)) {
    return takenMessage(gender)
  }
  if (
    relation === RELATION.CHILD &&
    familyHandle &&
    !(focusPerson.extended?.families ?? []).some(f => f.handle === familyHandle)
  ) {
    return 'The chosen family no longer exists.'
  }
  return ''
}

export async function fetchFocus(appState, handle) {
  const res = await appState.apiGet(
    `/api/people/${handle}?extend=primary_parent_family,family_list`
  )
  return 'error' in res ? {error: res.error} : {person: res.data}
}

// Reads the family fresh, applies change (which may return {error}) and
// saves it only if nobody changed it in between
async function updateFamily(appState, handle, change) {
  const res = await appState.apiGet(`/api/families/${handle}`)
  if ('error' in res) return {error: res.error}
  const family = clean(res.data)
  const next = change(family)
  if ('error' in next) return next
  return appState.apiPut(
    `/api/families/${handle}`,
    {_class: 'Family', ...family, ...next},
    {ifMatch: res.etag}
  )
}

const addChild = handle => family => ({
  child_ref_list: [...(family.child_ref_list ?? []), childRef(handle)],
})

const newFamily = (appState, family) =>
  appState.apiPost('/api/families/', {_class: 'Family', ...family})

async function link(appState, focus, {relation, handle, gender, familyHandle}) {
  switch (relation) {
    case RELATION.PARENT: {
      const family = parentFamily(focus)
      if (!family?.handle) {
        const role = roleFor(undefined, gender)
        return newFamily(appState, {
          [`${role}_handle`]: handle,
          child_ref_list: [childRef(focus.handle)],
        })
      }
      return updateFamily(appState, family.handle, fresh => {
        const role = roleFor(fresh, gender)
        return role
          ? {[`${role}_handle`]: handle}
          : {error: takenMessage(gender)}
      })
    }
    case RELATION.PARTNER: {
      const slot = slotOf(focus)
      return newFamily(appState, {
        [slot]: focus.handle,
        [otherSlot(slot)]: handle,
      })
    }
    case RELATION.CHILD:
      if (familyHandle) {
        return updateFamily(appState, familyHandle, addChild(handle))
      }
      return newFamily(appState, {
        [slotOf(focus)]: focus.handle,
        child_ref_list: [childRef(handle)],
      })
    case RELATION.SIBLING: {
      const family = parentFamily(focus)
      if (family?.handle) {
        return updateFamily(appState, family.handle, addChild(handle))
      }
      return newFamily(appState, {
        child_ref_list: [childRef(focus.handle), childRef(handle)],
      })
    }
    default:
      return {error: `Unknown relation ${relation}`}
  }
}

export async function linkRelative(appState, options) {
  const fresh = await fetchFocus(appState, options.focusHandle)
  if ('error' in fresh) return {error: fresh.error}
  const problem = checkRelative(fresh.person, options)
  if (problem) return {error: problem}
  const res = await link(appState, fresh.person, options)
  if ('error' in res) return {error: errorMessage(res)}
  return {transaction: res.data ?? []}
}
