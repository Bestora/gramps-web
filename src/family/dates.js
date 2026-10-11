// src/family/dates.js
// Plain-text date input for the family UI, converted to and from Gramps
// date objects.
import {emptyDate} from '../util.js'

const MODIFIERS = [
  [/^(um|ca\.?|circa|etwa)\s+/i, 3],
  [/^vor\s+/i, 1],
  [/^nach\s+/i, 2],
]
const PREFIX = {1: 'vor ', 2: 'nach ', 3: 'um '}
const INVALID = {error: 'invalid'}

export function parseDateInput(input) {
  let text = `${input ?? ''}`.trim()
  if (!text) return {date: null}
  let modifier = 0
  for (const [re, value] of MODIFIERS) {
    if (re.test(text)) {
      modifier = value
      text = text.replace(re, '')
      break
    }
  }
  let day = 0
  let month = 0
  let year = 0
  let m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) {
    ;[, day, month, year] = m.map(Number)
  } else if ((m = text.match(/^(\d{1,2})\.(\d{4})$/))) {
    ;[, month, year] = m.map(Number)
  } else if ((m = text.match(/^(\d{4})$/))) {
    year = Number(m[1])
  } else {
    return INVALID
  }
  if (m.length > 2 && (month < 1 || month > 12)) return INVALID
  if (day && day > new Date(year, month, 0).getDate()) return INVALID
  if (m.length === 4 && day < 1) return INVALID
  return {date: {...emptyDate, modifier, dateval: [day, month, year, false]}}
}

export function formatDateInput(date) {
  const [day, month, year] = date?.dateval ?? []
  if (!year) return ''
  const pad = n => String(n).padStart(2, '0')
  let core = `${year}`
  if (day && month) core = `${pad(day)}.${pad(month)}.${year}`
  else if (month) core = `${pad(month)}.${year}`
  return `${PREFIX[date.modifier] ?? ''}${core}`
}

// Whether the short text form can show a date without losing anything:
// Gregorian, regular quality, no range/span/text, no new-year offset
export function isSimpleDate(date) {
  if (!date) return true
  return (
    !date.calendar &&
    !date.quality &&
    !date.newyear &&
    [0, 1, 2, 3].includes(date.modifier ?? 0) &&
    (date.dateval?.length ?? 4) <= 4
  )
}

// Text left as it was keeps the original date object, so saving does not
// rewrite (and simplify) a date nobody touched
export function resolveDateInput(text, initialText, originalDate) {
  if (originalDate && text === initialText) return {date: originalDate}
  return parseDateInput(text)
}
