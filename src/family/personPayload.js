// src/family/personPayload.js
// Objects for creating a person with birth and death in one request.
import {emptyDate, makeHandle} from '../util.js'

export const GENDER = {FEMALE: 0, MALE: 1, UNKNOWN: 2}

export function buildNewPerson(
  {
    given = '',
    surname = '',
    gender = GENDER.UNKNOWN,
    birth = {},
    death = {},
    alive = true,
  },
  makeId = makeHandle
) {
  const person = {
    _class: 'Person',
    handle: makeId(),
    gender,
    citation_list: [],
    primary_name: {
      _class: 'Name',
      first_name: given.trim(),
      surname_list: [{_class: 'Surname', surname: surname.trim()}],
    },
    event_ref_list: [],
  }
  const objects = [person]
  const addEvent = (type, value, indexKey, always = false) => {
    if (!always && !value?.date && !value?.place) return
    const event = {
      _class: 'Event',
      handle: makeId(),
      type,
      date: value?.date ?? {...emptyDate},
      place: value?.place || '',
      citation_list: [],
    }
    person[indexKey] = person.event_ref_list.length
    person.event_ref_list.push({
      _class: 'EventRef',
      ref: event.handle,
      role: 'Primary',
    })
    objects.push(event)
  }
  addEvent('Birth', birth, 'birth_ref_index')
  if (!alive) addEvent('Death', death, 'death_ref_index', true)
  return objects
}
