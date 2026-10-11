// test/unit/familyDates.test.js
import {describe, it, expect} from 'vitest'
import {parseDateInput, formatDateInput} from '../../src/family/dates.js'

const dv = text => parseDateInput(text).date?.dateval
const mod = text => parseDateInput(text).date?.modifier

describe('parseDateInput', () => {
  it('reads full dates, month and year, and year only', () => {
    expect(dv('12.03.1958')).toEqual([12, 3, 1958, false])
    expect(dv('3.5.1932')).toEqual([3, 5, 1932, false])
    expect(dv('3.1958')).toEqual([0, 3, 1958, false])
    expect(dv('1958')).toEqual([0, 0, 1958, false])
  })

  it('reads about, before and after', () => {
    expect(mod('um 1900')).toBe(3)
    expect(mod('ca. 1900')).toBe(3)
    expect(mod('vor 1900')).toBe(1)
    expect(mod('nach 1.1900')).toBe(2)
    expect(mod('1900')).toBe(0)
  })

  it('returns a Gramps date object', () => {
    expect(parseDateInput('1958').date).toMatchObject({
      _class: 'Date',
      calendar: 0,
      quality: 0,
    })
  })

  it('treats empty input as no date', () => {
    expect(parseDateInput('  ')).toEqual({date: null})
    expect(parseDateInput(undefined)).toEqual({date: null})
  })

  it.each(['31.02.1950', '13.1950', '0.1950', 'abc', '1950-02-03', '12.3.58'])(
    'rejects %s',
    text => {
      expect(parseDateInput(text)).toEqual({error: 'invalid'})
    }
  )
})

describe('formatDateInput', () => {
  it('turns Gramps dates back into input text', () => {
    expect(formatDateInput({modifier: 0, dateval: [12, 3, 1958, false]})).toBe(
      '12.03.1958'
    )
    expect(formatDateInput({modifier: 3, dateval: [0, 0, 1900, false]})).toBe(
      'um 1900'
    )
    expect(formatDateInput({modifier: 1, dateval: [0, 5, 1900, false]})).toBe(
      'vor 05.1900'
    )
    expect(formatDateInput(undefined)).toBe('')
    expect(formatDateInput({modifier: 0, dateval: [0, 0, 0, false]})).toBe('')
  })

  it('round-trips through parseDateInput', () => {
    for (const text of [
      '12.03.1958',
      '05.1900',
      '1900',
      'um 1900',
      'nach 1850',
    ]) {
      expect(formatDateInput(parseDateInput(text).date)).toBe(text)
    }
  })
})
