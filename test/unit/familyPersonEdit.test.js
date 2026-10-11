// test/unit/familyPersonEdit.test.js
import {describe, it, expect} from 'vitest'
import {
  editValues,
  buildPersonEdit,
  rebaseEdit,
} from '../../src/family/personEdit.js'

const ids = () => {
  let n = 0
  return () => `n${(n += 1)}`
}
const d = (y, m = 0, day = 0) => ({
  _class: 'Date',
  modifier: 0,
  dateval: [day, m, y, false],
})
const ev = (handle, type, date, place = '', description = '') => ({
  _class: 'Event',
  handle,
  type,
  date,
  place,
  description,
})

const anna = () => ({
  _class: 'Person',
  handle: 'A',
  gender: 0,
  primary_name: {
    _class: 'Name',
    first_name: 'Anna',
    call: '',
    surname_list: [{_class: 'Surname', surname: 'Müller'}],
  },
  alternate_names: [],
  event_ref_list: [
    {_class: 'EventRef', ref: 'eB', role: 'Primary'},
    {_class: 'EventRef', ref: 'eO', role: 'Primary'},
  ],
  birth_ref_index: 0,
  death_ref_index: -1,
  note_list: [],
  profile: {birth: {place_name: 'Flensburg'}, death: {}},
  extended: {
    events: [
      ev('eB', 'Birth', d(1932, 5, 3), 'pF'),
      ev('eO', 'Occupation', d(0), '', 'Lehrerin'),
    ],
  },
  backlinks: {},
})

const values = (person, patch = {}) => ({
  ...editValues(person, person.extended.events),
  ...patch,
})

describe('editValues', () => {
  it('prefills the form from the person', () => {
    const p = anna()
    expect(editValues(p, p.extended.events)).toEqual({
      given: 'Anna',
      surname: 'Müller',
      birthName: '',
      callName: '',
      occupation: 'Lehrerin',
      memory: '',
      birth: {
        date: d(1932, 5, 3),
        place: 'pF',
        placeName: 'Flensburg',
        simple: true,
        display: '',
      },
      death: {date: null, place: '', placeName: '', simple: true, display: ''},
      alive: true,
    })
  })
})

describe('buildPersonEdit', () => {
  it('changes names and strips computed keys', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {given: 'Anne', callName: 'Änne', birthName: 'Schmidt'}),
      ids()
    )
    expect(res.person.primary_name.first_name).toBe('Anne')
    expect(res.person.primary_name.call).toBe('Änne')
    expect(res.person.alternate_names).toEqual([
      {
        _class: 'Name',
        type: 'Birth Name',
        first_name: 'Anne',
        surname_list: [{_class: 'Surname', surname: 'Schmidt'}],
      },
    ])
    expect(res.person.extended).toBeUndefined()
    expect(res.person.profile).toBeUndefined()
    expect(res.person.backlinks).toBeUndefined()
    expect(res.newObjects).toEqual([])
    expect(res.updatedEvents).toEqual([])
  })

  it('updates the existing birth event', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {birth: {date: d(1933), place: 'pK'}}),
      ids()
    )
    expect(res.updatedEvents).toEqual([
      {...p.extended.events[0], date: d(1933), place: 'pK'},
    ])
  })

  it('adds a death event and points death_ref_index at it', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {alive: false, death: {date: d(2011), place: 'pK'}}),
      ids()
    )
    expect(res.newObjects).toEqual([
      {
        _class: 'Event',
        handle: 'n1',
        type: 'Death',
        date: d(2011),
        place: 'pK',
        citation_list: [],
      },
    ])
    expect(res.person.event_ref_list.at(-1)).toEqual({
      _class: 'EventRef',
      ref: 'n1',
      role: 'Primary',
    })
    expect(res.person.death_ref_index).toBe(2)
  })

  it('removes the death reference when the person is alive again', () => {
    const p = anna()
    p.event_ref_list.push({_class: 'EventRef', ref: 'eD', role: 'Primary'})
    p.death_ref_index = 2
    p.extended.events.push(ev('eD', 'Death', d(2011)))
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {alive: true}),
      ids()
    )
    expect(res.person.event_ref_list.map(r => r.ref)).toEqual(['eB', 'eO'])
    expect(res.person.death_ref_index).toBe(-1)
    expect(res.person.birth_ref_index).toBe(0)
  })

  it('updates the occupation description', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {occupation: 'Rektorin'}),
      ids()
    )
    expect(res.updatedEvents).toEqual([
      {...p.extended.events[1], description: 'Rektorin'},
    ])
  })

  it('saves a memory as a new plain-text note', () => {
    const p = anna()
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {memory: ' Sie backte den besten Kuchen. '}),
      ids()
    )
    expect(res.newObjects).toEqual([
      {
        _class: 'Note',
        handle: 'n1',
        type: 'General',
        text: {
          _class: 'StyledText',
          string: 'Sie backte den besten Kuchen.',
          tags: [],
        },
      },
    ])
    expect(res.person.note_list).toEqual(['n1'])
  })

  it('creates a birth event when the reference points nowhere', () => {
    const p = anna()
    p.birth_ref_index = 5
    const res = buildPersonEdit(
      p,
      p.extended.events,
      values(p, {birth: {date: d(1932), place: ''}}),
      ids()
    )
    expect(res.newObjects[0]).toMatchObject({type: 'Birth', handle: 'n1'})
    expect(res.person.birth_ref_index).toBe(2)
  })
})

describe('dates that the short form cannot show', () => {
  it('marks them read-only with the display text', () => {
    const p = anna()
    p.extended.events[0].date = {
      _class: 'Date',
      calendar: 0,
      modifier: 4,
      quality: 1,
      dateval: [0, 0, 1930, false, 0, 0, 1932, false],
    }
    p.profile.birth.date = 'zwischen 1930 und 1932 (geschätzt)'
    const v = editValues(p, p.extended.events)
    expect(v.birth.simple).toBe(false)
    expect(v.birth.display).toBe('zwischen 1930 und 1932 (geschätzt)')
    expect(v.death.simple).toBe(true)
  })

  it('does not rewrite an untouched server date', () => {
    const p = anna()
    p.extended.events[0].date = {
      _class: 'Date',
      calendar: 0,
      modifier: 0,
      quality: 0,
      dateval: [3, 5, 1932, false],
      sortval: 2426465,
      text: '',
      newyear: 0,
    }
    const v = editValues(p, p.extended.events)
    const res = buildPersonEdit(
      p,
      p.extended.events,
      {...v, occupation: 'Rektorin'},
      ids()
    )
    expect(res.updatedEvents.map(e => e.type)).toEqual(['Occupation'])
  })
})

describe('rebaseEdit', () => {
  const initial = {
    given: 'Anna',
    surname: 'Müller',
    birthName: '',
    callName: '',
    occupation: 'Lehrerin',
    memory: '',
    birth: {date: d(1932), place: 'pF', placeName: 'Flensburg'},
    death: {date: null, place: '', placeName: ''},
    alive: true,
  }
  // someone else changed the occupation and the birth year meanwhile
  const fresh = {
    ...initial,
    occupation: 'Rektorin',
    birth: {date: d(1933), place: 'pF', placeName: 'Flensburg'},
  }

  it('keeps changes made by others in fields the user did not touch', () => {
    const submitted = {...initial, callName: 'Änne'}
    const res = rebaseEdit(initial, submitted, fresh)
    expect(res.occupation).toBe('Rektorin')
    expect(res.birth.date).toEqual(d(1933))
    expect(res.callName).toBe('Änne')
  })

  it('applies what the user changed', () => {
    const submitted = {
      ...initial,
      occupation: 'Direktorin',
      birth: {...initial.birth, date: d(1931)},
      alive: false,
      death: {date: d(2011), place: '', placeName: ''},
      memory: 'Neu',
    }
    const res = rebaseEdit(initial, submitted, fresh)
    expect(res.occupation).toBe('Direktorin')
    expect(res.birth.date).toEqual(d(1931))
    expect(res.alive).toBe(false)
    expect(res.death.date).toEqual(d(2011))
    expect(res.memory).toBe('Neu')
  })

  it('keeps a photo someone else added when saving on the fresh person', () => {
    const p = anna()
    const latest = {...anna(), media_list: [{ref: 'm9'}]}
    const values = rebaseEdit(
      editValues(p, p.extended.events),
      {...editValues(p, p.extended.events), callName: 'Änne'},
      editValues(latest, latest.extended.events)
    )
    const res = buildPersonEdit(latest, latest.extended.events, values, ids())
    expect(res.person.media_list).toEqual([{ref: 'm9'}])
    expect(res.person.primary_name.call).toBe('Änne')
  })
})
