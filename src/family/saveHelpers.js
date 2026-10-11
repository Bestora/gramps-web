// src/family/saveHelpers.js
// Shared steps of the family save flows.
import {makeHandle, fireEvent} from '../util.js'
import {newPlace} from './places.js'

const norm = s => `${s ?? ''}`.trim().toLowerCase()

export async function ensurePlaces(appState, values, makeId = makeHandle) {
  const created = new Map()
  const transaction = []
  const next = {...values}
  for (const key of ['birth', 'death']) {
    const v = values[key]
    if (!v || v.place || !norm(v.placeName)) continue
    let handle = created.get(norm(v.placeName))
    if (!handle) {
      const place = newPlace(v.placeName, makeId)
      // eslint-disable-next-line no-await-in-loop
      const res = await appState.apiPost('/api/places/', place, {
        dbChanged: false,
      })
      if ('error' in res) return {error: res.error}
      transaction.push(...(res.data ?? []))
      handle = place.handle
      created.set(norm(v.placeName), handle)
    }
    next[key] = {...v, place: handle}
  }
  return {values: next, transaction}
}

export function fireUndo(target, message, transaction, redirect) {
  fireEvent(target, 'transaction:undo', {message, transaction, redirect})
}

// Message for a failed request; a 412 means the record changed since it was
// read (If-Match)
export function errorMessage(res) {
  if (res?.errorDetail?.status === 412) {
    return 'Someone else has just changed this. Please try again.'
  }
  return res?.error ?? ''
}
