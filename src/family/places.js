// src/family/places.js
// Place search and creation for the family UI.
import {makeHandle} from '../util.js'

export function placeSearchUrl(query, locale) {
  return `/api/search/?query=${encodeURIComponent(
    `${query}*`
  )}&type=place&profile=self&locale=${locale}&page=1&pagesize=8`
}

export function newPlace(name, makeId = makeHandle) {
  return {
    _class: 'Place',
    handle: makeId(),
    name: {_class: 'PlaceName', value: name.trim()},
    place_type: 'Unknown',
  }
}

export function placeTitle(place) {
  return place?.profile?.name || place?.name?.value || ''
}
