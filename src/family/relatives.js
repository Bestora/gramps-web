// Links a newly created or existing person to the focus person.
//
// The focus person and any family that is changed are read fresh right
// before writing, so a change made by someone else since the canvas was
// loaded is kept.
// ponytail: read-then-write leaves a window of milliseconds; the API's GET
// ETag hashes the response, not the object, so If-Match cannot close it.
// Closing it needs a server-side compare-and-set.

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
    (relation === RELATION.CHILD || relation === RELATION.PARTNER) &&
    familyHandle
  ) {
    const family = (focusPerson.extended?.families ?? []).find(
      f => f.handle === familyHandle
    )
    if (!family) return 'The chosen family no longer exists.'
    if (
      relation === RELATION.PARTNER &&
      family.father_handle &&
      family.mother_handle
    ) {
      return 'This family already has two parents.'
    }
  }
  return ''
}

// A family that records nothing but its members
const EXTRAS = [
  'event_ref_list',
  'media_list',
  'note_list',
  'citation_list',
  'attribute_list',
  'lds_ord_list',
]
const hasNoExtras = family => EXTRAS.every(key => !family[key]?.length)
const memberCount = family =>
  [family.father_handle, family.mother_handle].filter(Boolean).length +
  (family.child_ref_list?.length ?? 0)

export async function fetchFocus(appState, handle) {
  const res = await appState.apiGet(
    `/api/people/${handle}?extend=primary_parent_family,family_list`
  )
  return 'error' in res ? {error: res.error} : {person: res.data}
}

// Reads the family fresh, applies change (which may return {error}) to that
// copy and saves it
async function updateFamily(appState, handle, change) {
  const res = await appState.apiGet(`/api/families/${handle}`)
  if ('error' in res) return {error: res.error}
  const family = clean(res.data)
  const next = change(family)
  if ('error' in next) return next
  return appState.apiPut(`/api/families/${handle}`, {
    _class: 'Family',
    ...family,
    ...next,
  })
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
      if (familyHandle) {
        // the new partner is the other parent of this family's children
        return updateFamily(appState, familyHandle, fresh => {
          let slot = null
          if (fresh.father_handle === focus.handle) slot = 'mother_handle'
          if (fresh.mother_handle === focus.handle) slot = 'father_handle'
          return slot && !fresh[slot]
            ? {[slot]: handle}
            : {error: 'This family already has two parents.'}
        })
      }
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

// After a parent is added: an empty family of the same two parents (e.g.
// the new parent was first added as the other one's partner) would show up
// as a duplicate, so it is removed
async function removeEmptySharedFamilies(appState, parent, other, keepHandle) {
  const fresh = await fetchFocus(appState, parent)
  if ('error' in fresh) return []
  const duplicates = (fresh.person.extended?.families ?? []).filter(
    f =>
      f.handle !== keepHandle &&
      [f.father_handle, f.mother_handle].includes(other) &&
      !f.child_ref_list?.length &&
      hasNoExtras(f)
  )
  const transaction = []
  for (const family of duplicates) {
    // eslint-disable-next-line no-await-in-loop
    const res = await appState.apiDelete(`/api/families/${family.handle}`)
    if (!('error' in res)) transaction.push(...(res.data ?? []))
  }
  return transaction
}

export async function linkRelative(appState, options) {
  const fresh = await fetchFocus(appState, options.focusHandle)
  if ('error' in fresh) return {error: fresh.error}
  const problem = checkRelative(fresh.person, options)
  if (problem) return {error: problem}
  const res = await link(appState, fresh.person, options)
  if ('error' in res) return {error: res.error}
  const transaction = [...(res.data ?? [])]
  const family = parentFamily(fresh.person)
  if (options.relation === RELATION.PARENT && family?.handle) {
    const other =
      roleFor(family, options.gender) === 'father'
        ? family.mother_handle
        : family.father_handle
    if (other) {
      transaction.push(
        ...(await removeEmptySharedFamilies(
          appState,
          other,
          options.handle,
          family.handle
        ))
      )
    }
  }
  return {transaction}
}

// Removes one connection: a child from a family (kind 'child'), the person
// from their parent family ('parents') or a partner from a family
// ('partner'). People stay in the tree; a family left with at most one
// person and nothing else recorded is deleted.
export async function unlinkRelative(appState, {kind, familyHandle, handle}) {
  const res = await appState.apiGet(`/api/families/${familyHandle}`)
  if ('error' in res) return {error: res.error}
  const family = clean(res.data)
  const next = {...family}
  if (kind === 'partner') {
    if (next.father_handle === handle) next.father_handle = ''
    if (next.mother_handle === handle) next.mother_handle = ''
  } else {
    next.child_ref_list = (family.child_ref_list ?? []).filter(
      ref => ref.ref !== handle
    )
  }
  const saved =
    memberCount(next) <= 1 && hasNoExtras(next)
      ? await appState.apiDelete(`/api/families/${familyHandle}`)
      : await appState.apiPut(`/api/families/${familyHandle}`, {
          _class: 'Family',
          ...next,
        })
  if ('error' in saved) return {error: saved.error}
  return {transaction: saved.data ?? []}
}
