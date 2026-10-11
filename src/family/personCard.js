// src/family/personCard.js
// Display data for a person card in the family UI.
import {getImageUrl} from '../charts/util.js'

export function yearOf(date) {
  return `${date ?? ''}`.match(/\d{4}/)?.[0] ?? ''
}

const event = e => ({date: e?.date ?? '', place: e?.place_name ?? ''})

export function personCard(person) {
  const profile = person?.profile ?? {}
  const given = profile.name_given ?? ''
  const surname = profile.name_surname ?? ''
  const born = yearOf(profile.birth?.date)
  const died = yearOf(profile.death?.date)
  let years = ''
  if (born && died) years = `${born} – ${died}`
  else if (died) years = `† ${died}`
  else if (born) years = `* ${born}`
  const initials = `${given.charAt(0)}${surname.charAt(0)}`.toUpperCase() || '?'
  return {
    handle: person?.handle ?? '',
    grampsId: person?.gramps_id ?? '',
    name: [given, surname].filter(Boolean).join(' '),
    givenName: given,
    years,
    initials,
    imageUrl: person ? getImageUrl(person, 96) : '',
    birth: event(profile.birth),
    death: event(profile.death),
  }
}
