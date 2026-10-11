// test/unit/familyPersonPayload.test.js
import {describe, it, expect} from 'vitest'
import {buildNewPerson, GENDER} from '../../src/family/personPayload.js'
import {placeSearchUrl, newPlace, placeTitle} from '../../src/family/places.js'

const ids = () => {
  let n = 0
  return () => `h${(n += 1)}`
}
const date1958 = {_class: 'Date', modifier: 0, dateval: [0, 0, 1958, false]}

describe('buildNewPerson', () => {
  it('creates just the person when nothing else is known', () => {
    const objects = buildNewPerson(
      {given: ' Lisa ', surname: 'Weber ', gender: GENDER.FEMALE, alive: true},
      ids()
    )
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({
      _class: 'Person',
      handle: 'h1',
      gender: 0,
      primary_name: {
        _class: 'Name',
        first_name: 'Lisa',
        surname_list: [{_class: 'Surname', surname: 'Weber'}],
      },
      event_ref_list: [],
    })
    expect(objects[0].birth_ref_index).toBeUndefined()
  })

  it('adds a birth event with date and place', () => {
    const [person, birth] = buildNewPerson(
      {
        given: 'Lisa',
        surname: 'Weber',
        gender: 0,
        birth: {date: date1958, place: 'p1'},
        alive: true,
      },
      ids()
    )
    expect(birth).toMatchObject({
      _class: 'Event',
      handle: 'h2',
      type: 'Birth',
      date: date1958,
      place: 'p1',
    })
    expect(person.event_ref_list).toEqual([
      {_class: 'EventRef', ref: 'h2', role: 'Primary'},
    ])
    expect(person.birth_ref_index).toBe(0)
  })

  it('records a death even without date or place', () => {
    const [person, death] = buildNewPerson(
      {given: 'Otto', surname: 'Weber', gender: 1, alive: false},
      ids()
    )
    expect(death.type).toBe('Death')
    expect(death.date._class).toBe('Date')
    expect(person.death_ref_index).toBe(0)
  })

  it('ignores death data for living people', () => {
    const objects = buildNewPerson(
      {
        given: 'A',
        surname: 'B',
        gender: 2,
        death: {date: date1958, place: ''},
        alive: true,
      },
      ids()
    )
    expect(objects).toHaveLength(1)
  })
})

describe('places', () => {
  it('searches places with a prefix query', () => {
    expect(placeSearchUrl('Flens', 'de')).toContain('query=Flens*')
    expect(placeSearchUrl('Flens', 'de')).toContain('type=place')
  })

  it('builds a minimal new place', () => {
    expect(newPlace(' Kiel ', () => 'p9')).toEqual({
      _class: 'Place',
      handle: 'p9',
      name: {_class: 'PlaceName', value: 'Kiel'},
      place_type: 'Unknown',
    })
  })

  it('names a place from a search result', () => {
    expect(
      placeTitle({profile: {name: 'Kiel, DE'}, name: {value: 'Kiel'}})
    ).toBe('Kiel, DE')
    expect(placeTitle({name: {value: 'Kiel'}})).toBe('Kiel')
    expect(placeTitle(undefined)).toBe('')
  })
})
