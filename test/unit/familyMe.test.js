// test/unit/familyMe.test.js
import {describe, it, expect, beforeEach} from 'vitest'
import {
  normalizeName,
  matchPeopleByName,
  myPersonHandle,
  onboardingDone,
  setOnboardingDone,
} from '../../src/family/me.js'
import {kinship} from '../../src/family/kinship.js'
import {withMediaRef} from '../../src/family/media.js'
import {relationUrls, personUrl} from '../../src/family/familyApi.js'

const p = (handle, given, surname) => ({
  handle,
  profile: {name_given: given, name_surname: surname},
})

describe('matchPeopleByName', () => {
  const people = [
    p('a', 'Max', 'Garner'),
    p('b', 'Max', 'Garner'),
    p('c', 'Max Peter', 'Garner'),
    p('d', 'Moritz', 'Garner'),
  ]

  it('normalises case, accents and spaces', () => {
    expect(normalizeName('  Jörg   MÜLLER ')).toBe('jörg müller')
  })

  it('separates exact from partial matches', () => {
    const res = matchPeopleByName(people, 'max  garner')
    expect(res.exact.map(x => x.handle)).toEqual(['a', 'b'])
    expect(res.partial.map(x => x.handle)).toEqual(['c'])
  })

  it('finds nothing for an unknown name', () => {
    expect(matchPeopleByName(people, 'Erika Mustermann')).toEqual({
      exact: [],
      partial: [],
    })
  })
})

describe('myPersonHandle', () => {
  it('reads the link from the tree config', () => {
    const config = {'frontend.userPersons': {max: 'H1'}}
    expect(myPersonHandle(config, 'max')).toBe('H1')
    expect(myPersonHandle(config, 'moritz')).toBe('')
    expect(myPersonHandle(undefined, 'max')).toBe('')
  })
})

describe('onboarding flag', () => {
  beforeEach(() => localStorage.clear())

  it('is remembered per account', () => {
    expect(onboardingDone('max')).toBe(false)
    setOnboardingDone('max')
    expect(onboardingDone('max')).toBe(true)
    expect(onboardingDone('moritz')).toBe(false)
    setOnboardingDone('max', false)
    expect(onboardingDone('max')).toBe(false)
  })
})

describe('kinship', () => {
  const names = {h1: 'Hans Müller', h2: 'Erna Müller'}
  it('combines the relation and the common ancestors', () => {
    expect(
      kinship(
        {relationship_string: 'Großtante'},
        [{relationship_string: 'Großtante', common_ancestors: ['h1', 'h2']}],
        h => names[h]
      )
    ).toEqual({
      relation: 'Großtante',
      ancestors: ['Hans Müller', 'Erna Müller'],
    })
  })

  it('copes with no relation', () => {
    expect(kinship({relationship_string: ''}, [{}], () => '')).toEqual({
      relation: '',
      ancestors: [],
    })
    expect(kinship(undefined, undefined, () => '')).toEqual({
      relation: '',
      ancestors: [],
    })
  })
})

describe('withMediaRef', () => {
  const list = [{ref: 'm1'}, {ref: 'm2', rect: [0, 0, 50, 50]}]
  it('appends a photo, or puts it first as profile picture', () => {
    expect(withMediaRef(list, 'm3', false).map(r => r.ref)).toEqual([
      'm1',
      'm2',
      'm3',
    ])
    expect(withMediaRef(list, 'm3', true).map(r => r.ref)).toEqual([
      'm3',
      'm1',
      'm2',
    ])
  })
  it('moves an existing photo instead of duplicating it', () => {
    expect(withMediaRef(list, 'm2', true)).toEqual([
      {ref: 'm2', rect: [0, 0, 50, 50]},
      {ref: 'm1'},
    ])
    expect(withMediaRef(undefined, 'm1', false)).toEqual([
      {_class: 'MediaRef', ref: 'm1'},
    ])
  })
})

describe('familyApi URLs', () => {
  it('builds relation and person URLs', () => {
    expect(relationUrls('a', 'b', 'de')).toEqual({
      one: '/api/relations/a/b?locale=de',
      all: '/api/relations/a/b/all?locale=de',
    })
    expect(personUrl('h', 'de')).toBe(
      '/api/people/h?extend=event_ref_list&profile=self&locale=de'
    )
  })
})
