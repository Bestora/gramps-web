// src/family/me.js
// Which person in the tree the logged-in account is.
import {TREE_CONFIG_USER_PERSONS} from './uiMode.js'

export function normalizeName(text) {
  return `${text ?? ''}`
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const fullNameOf = person =>
  normalizeName(
    `${person.profile?.name_given ?? ''} ${person.profile?.name_surname ?? ''}`
  )

export function matchPeopleByName(people, fullName) {
  const wanted = normalizeName(fullName)
  const tokens = wanted.split(' ').filter(Boolean)
  const exact = []
  const partial = []
  for (const person of people) {
    const name = fullNameOf(person)
    if (name === wanted) exact.push(person)
    else if (tokens.length && tokens.every(t => name.split(' ').includes(t))) {
      partial.push(person)
    }
  }
  return {exact, partial}
}

export function myPersonHandle(treeConfig, username) {
  return treeConfig?.[TREE_CONFIG_USER_PERSONS]?.[username] ?? ''
}

const key = username => `grampsjs_family_onboarding_${username}`

export function onboardingDone(username) {
  try {
    return localStorage.getItem(key(username)) === '1'
  } catch (e) {
    return false
  }
}

export function setOnboardingDone(username, done = true) {
  try {
    if (done) localStorage.setItem(key(username), '1')
    else localStorage.removeItem(key(username))
  } catch (e) {
    // ignore
  }
}
