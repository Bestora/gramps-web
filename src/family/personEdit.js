// src/family/personEdit.js
// Turns the family edit form into updates of a person and its events.
import {emptyDate, makeHandle} from '../util.js'
import {isSimpleDate} from './dates.js'

const strip = ({extended, profile, backlinks, formatted, ...rest}) => rest
const sameDate = (a, b) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const isEmptyDate = date => !date?.dateval?.[2]

function eventAt(person, events, indexKey) {
  const ref = person.event_ref_list?.[person[indexKey]]
  return ref ? events.find(e => e.handle === ref.ref) : undefined
}

const occupationOf = (person, events) =>
  (person.event_ref_list ?? [])
    .map(ref => events.find(e => e.handle === ref.ref))
    .find(e => e?.type === 'Occupation')

const birthNameOf = person =>
  (person.alternate_names ?? []).find(n => n.type === 'Birth Name')

export function editValues(person, events) {
  const birth = eventAt(person, events, 'birth_ref_index')
  const death = eventAt(person, events, 'death_ref_index')
  const eventValues = (e, profile) => {
    const date = e && !isEmptyDate(e.date) ? e.date : null
    return {
      date,
      place: e?.place ?? '',
      placeName: e ? profile?.place_name ?? '' : '',
      simple: isSimpleDate(date),
      display: e ? profile?.date ?? '' : '',
    }
  }
  return {
    given: person.primary_name?.first_name ?? '',
    surname: person.primary_name?.surname_list?.[0]?.surname ?? '',
    birthName: birthNameOf(person)?.surname_list?.[0]?.surname ?? '',
    callName: person.primary_name?.call ?? '',
    occupation: occupationOf(person, events)?.description ?? '',
    memory: '',
    birth: eventValues(birth, person.profile?.birth),
    death: eventValues(death, person.profile?.death),
    alive: !death,
  }
}

export function buildPersonEdit(person, events, values, makeId = makeHandle) {
  const next = {_class: 'Person', ...strip(person)}
  next.event_ref_list = [...(person.event_ref_list ?? [])]
  next.note_list = [...(person.note_list ?? [])]
  const newObjects = []
  const updatedEvents = []

  const surnames = [...(person.primary_name?.surname_list ?? [])]
  surnames[0] = {
    _class: 'Surname',
    ...surnames[0],
    surname: values.surname.trim(),
  }
  next.primary_name = {
    _class: 'Name',
    ...person.primary_name,
    first_name: values.given.trim(),
    call: values.callName.trim(),
    surname_list: surnames,
  }

  const birthName = values.birthName.trim()
  const others = (person.alternate_names ?? []).filter(
    n => n.type !== 'Birth Name'
  )
  next.alternate_names = birthName
    ? [
        ...others,
        {
          _class: 'Name',
          ...birthNameOf(person),
          type: 'Birth Name',
          first_name: values.given.trim(),
          surname_list: [{_class: 'Surname', surname: birthName}],
        },
      ]
    : others

  const appendEvent = event => {
    newObjects.push(event)
    next.event_ref_list.push({
      _class: 'EventRef',
      ref: event.handle,
      role: 'Primary',
    })
    return next.event_ref_list.length - 1
  }

  const saveEvent = (type, indexKey, value, always = false) => {
    const existing = eventAt(person, events, indexKey)
    const date = value.date ?? null
    if (existing) {
      const changed =
        !sameDate(isEmptyDate(existing.date) ? null : existing.date, date) ||
        (existing.place ?? '') !== (value.place ?? '')
      if (changed) {
        updatedEvents.push({
          ...existing,
          date: date ?? {...emptyDate},
          place: value.place ?? '',
        })
      }
      return
    }
    if (!always && !date && !value.place) return
    next[indexKey] = appendEvent({
      _class: 'Event',
      handle: makeId(),
      type,
      date: date ?? {...emptyDate},
      place: value.place ?? '',
      citation_list: [],
    })
  }

  saveEvent('Birth', 'birth_ref_index', values.birth)
  if (values.alive) {
    const death = eventAt(person, events, 'death_ref_index')
    if (death) {
      const index = person.death_ref_index
      next.event_ref_list.splice(index, 1)
      next.death_ref_index = -1
      if (next.birth_ref_index > index) next.birth_ref_index -= 1
    }
  } else {
    saveEvent('Death', 'death_ref_index', values.death, true)
  }

  const occupation = values.occupation.trim()
  const job = occupationOf(person, events)
  if (job && (job.description ?? '') !== occupation) {
    updatedEvents.push({...job, description: occupation})
  } else if (!job && occupation) {
    appendEvent({
      _class: 'Event',
      handle: makeId(),
      type: 'Occupation',
      description: occupation,
      date: {...emptyDate},
      place: '',
      citation_list: [],
    })
  }

  const memory = values.memory.trim()
  if (memory) {
    const note = {
      _class: 'Note',
      handle: makeId(),
      type: 'General',
      text: {_class: 'StyledText', string: memory, tags: []},
    }
    newObjects.push(note)
    next.note_list.push(note.handle)
  }

  return {person: next, newObjects, updatedEvents}
}
