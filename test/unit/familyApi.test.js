// test/unit/familyApi.test.js
import {describe, it, expect} from 'vitest'
import {
  neighborhoodUrl,
  fetchNeighborhoodGraph,
  fetchGrampsId,
  searchPeopleUrl,
} from '../../src/family/familyApi.js'

const decodeRules = url =>
  JSON.parse(decodeURIComponent(url.match(/rules=([^&]+)/)[1]))

describe('neighborhoodUrl', () => {
  it('asks for three generations up and down', () => {
    const url = neighborhoodUrl('I1', 'de')
    expect(url.startsWith('/api/people/?')).toBe(true)
    expect(decodeRules(url)).toEqual({
      function: 'or',
      rules: [
        {name: 'IsLessThanNthGenerationAncestorOf', values: ['I1', 3]},
        {name: 'IsLessThanNthGenerationDescendantOf', values: ['I1', 3]},
      ],
    })
    expect(url).toContain('locale=de')
    expect(url).toContain('profile=self')
    expect(url).toContain(
      'extend=primary_parent_family,family_list,parent_family_list'
    )
  })
})

describe('fetchNeighborhoodGraph', () => {
  const anna = {
    handle: 'A',
    gramps_id: 'I1',
    extended: {
      families: [
        {
          handle: 'f1',
          father_handle: 'K',
          mother_handle: 'A',
          child_ref_list: [],
        },
      ],
    },
  }

  it('loads partners that the rules did not return', async () => {
    const calls = []
    const apiGet = async url => {
      calls.push(url)
      if (url.includes('rules=')) return {data: [anna]}
      return {
        data: [{handle: 'K', gramps_id: 'I2', profile: {name_given: 'Karl'}}],
      }
    }
    const res = await fetchNeighborhoodGraph(apiGet, 'I1', 'de')
    expect(res.focus).toBe('A')
    expect(res.graph.person('K').profile.name_given).toBe('Karl')
    expect(calls[1]).toContain('handles=K')
  })

  it('does not make a second request when all partners are known', async () => {
    let count = 0
    const karl = {handle: 'K', gramps_id: 'I2'}
    const apiGet = async () => {
      count += 1
      return {data: [anna, karl]}
    }
    await fetchNeighborhoodGraph(apiGet, 'I1', 'de')
    expect(count).toBe(1)
  })

  it('reports an unknown Gramps ID', async () => {
    const res = await fetchNeighborhoodGraph(
      async () => ({data: []}),
      'I9',
      'de'
    )
    expect(res.error).toBeTruthy()
  })

  it('passes API errors through', async () => {
    const res = await fetchNeighborhoodGraph(
      async () => ({error: 'boom'}),
      'I1',
      'de'
    )
    expect(res).toEqual({error: 'boom'})
  })
})

describe('fetchGrampsId', () => {
  it('returns the Gramps ID of a handle, or an empty string', async () => {
    expect(
      await fetchGrampsId(async () => ({data: {gramps_id: 'I7'}}), 'h')
    ).toBe('I7')
    expect(await fetchGrampsId(async () => ({error: 'x'}), 'h')).toBe('')
  })
})

describe('searchPeopleUrl', () => {
  it('searches people with a prefix query', () => {
    const url = searchPeopleUrl('Mül', 'de')
    expect(url).toContain('query=M%C3%BCl*')
    expect(url).toContain('type=person')
    expect(url).toContain('pagesize=8')
  })
})

describe('fetchNeighborhoodGraph siblings', () => {
  it('loads siblings, who are neither ancestors nor descendants', async () => {
    const dan = {
      handle: 'D',
      gramps_id: 'I1',
      extended: {
        families: [],
        primary_parent_family: {
          handle: 'fP',
          father_handle: 'H',
          mother_handle: 'E',
          child_ref_list: [{ref: 'D'}, {ref: 'K'}],
        },
      },
    }
    const calls = []
    const apiGet = async url => {
      calls.push(url)
      if (url.includes('rules=')) {
        return {
          data: [
            dan,
            {handle: 'H', gramps_id: 'I2'},
            {handle: 'E', gramps_id: 'I3'},
          ],
        }
      }
      return {
        data: [{handle: 'K', gramps_id: 'I4', profile: {name_given: 'Kim'}}],
      }
    }
    const res = await fetchNeighborhoodGraph(apiGet, 'I1', 'de')
    expect(res.graph.person('K').profile.name_given).toBe('Kim')
    expect(calls[1]).toContain('handles=K')
  })
})
