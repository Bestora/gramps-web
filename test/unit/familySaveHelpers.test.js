// test/unit/familySaveHelpers.test.js
import {describe, it, expect} from 'vitest'
import {ensurePlaces, fireUndo} from '../../src/family/saveHelpers.js'

const values = (birthPlace, deathPlace) => ({
  birth: {date: null, ...birthPlace},
  death: {date: null, ...deathPlace},
})

describe('ensurePlaces', () => {
  it('creates new places once and fills in their handles', async () => {
    const posted = []
    const appState = {
      apiPost: async (url, body) => {
        posted.push({url, body})
        return {data: [{type: 'add', handle: body.handle}]}
      },
    }
    const res = await ensurePlaces(
      appState,
      values({place: '', placeName: 'Kiel'}, {place: '', placeName: ' kiel '}),
      () => 'pNew'
    )
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toBe('/api/places/')
    expect(res.values.birth.place).toBe('pNew')
    expect(res.values.death.place).toBe('pNew')
    expect(res.transaction).toHaveLength(1)
  })

  it('keeps known places and empty fields untouched', async () => {
    const appState = {
      apiPost: async () => {
        throw new Error('must not be called')
      },
    }
    const res = await ensurePlaces(
      appState,
      values({place: 'p1', placeName: 'Flensburg'}, {place: '', placeName: ''}),
      () => 'x'
    )
    expect(res.values.birth.place).toBe('p1')
    expect(res.values.death.place).toBe('')
    expect(res.transaction).toEqual([])
  })

  it('stops on an API error', async () => {
    const appState = {apiPost: async () => ({error: 'boom'})}
    const res = await ensurePlaces(
      appState,
      values({place: '', placeName: 'Kiel'}, {}),
      () => 'x'
    )
    expect(res).toEqual({error: 'boom'})
  })
})

describe('fireUndo', () => {
  it('dispatches transaction:undo with the combined transaction', () => {
    let detail
    window.addEventListener(
      'transaction:undo',
      e => {
        detail = e.detail
      },
      {once: true}
    )
    const el = document.createElement('div')
    document.body.appendChild(el)
    fireUndo(el, 'Saved', [{a: 1}, {b: 2}], 'person/I1')
    expect(detail).toEqual({
      message: 'Saved',
      transaction: [{a: 1}, {b: 2}],
      redirect: 'person/I1',
    })
  })
})
