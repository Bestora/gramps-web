// test/unit/familyPersonCard.test.js
import {describe, it, expect} from 'vitest'
import {personCard, yearOf} from '../../src/family/personCard.js'

describe('yearOf', () => {
  it('extracts a four-digit year from any date string', () => {
    expect(yearOf('1932-05-03')).toBe('1932')
    expect(yearOf('3. Mai 1932')).toBe('1932')
    expect(yearOf('um 1900')).toBe('1900')
  })

  it('returns an empty string when there is no year', () => {
    expect(yearOf('')).toBe('')
    expect(yearOf(undefined)).toBe('')
    expect(yearOf('Mai')).toBe('')
  })
})

describe('personCard', () => {
  const anna = {
    handle: 'A',
    gramps_id: 'I1',
    media_list: [],
    profile: {
      name_given: 'Anna',
      name_surname: 'Müller',
      birth: {date: '1932-05-03', place_name: 'Flensburg'},
      death: {date: '2011-02-14', place_name: 'Kiel'},
    },
  }

  it('builds display data from a person profile', () => {
    expect(personCard(anna)).toEqual({
      handle: 'A',
      grampsId: 'I1',
      name: 'Anna Müller',
      givenName: 'Anna',
      years: '1932 – 2011',
      initials: 'AM',
      imageUrl: '',
      birth: {date: '1932-05-03', place: 'Flensburg'},
      death: {date: '2011-02-14', place: 'Kiel'},
    })
  })

  it('shows "* year" for living people and copes with missing data', () => {
    const card = personCard({
      handle: 'B',
      gramps_id: 'I2',
      profile: {name_given: 'Lisa', birth: {date: '1984'}, death: {}},
    })
    expect(card.name).toBe('Lisa')
    expect(card.years).toBe('* 1984')
    expect(card.initials).toBe('L')
    expect(card.death).toEqual({date: '', place: ''})
  })

  it('returns a placeholder for an unknown person', () => {
    const card = personCard(undefined)
    expect(card.name).toBe('')
    expect(card.years).toBe('')
    expect(card.initials).toBe('?')
  })
})
