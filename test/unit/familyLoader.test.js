import {describe, it, expect} from 'vitest'
import {
  NeighborhoodLoader,
  LayoutCache,
  isTap,
} from '../../src/family/loader.js'

const deferred = () => {
  let resolve
  const promise = new Promise(r => {
    resolve = r
  })
  return {promise, resolve}
}

describe('NeighborhoodLoader', () => {
  it('applies only the latest of overlapping loads', async () => {
    const pending = {A: deferred(), B: deferred()}
    const loader = new NeighborhoodLoader(id => pending[id].promise)
    const first = loader.load('A')
    const second = loader.load('B')
    pending.B.resolve({graph: 'gB', focus: 'b'})
    await second
    pending.A.resolve({graph: 'gA', focus: 'a'})
    await first
    expect(loader.state).toMatchObject({graph: 'gB', focus: 'b', error: ''})
  })

  it('does not reload the person that is already shown', async () => {
    let calls = 0
    const loader = new NeighborhoodLoader(async () => {
      calls += 1
      return {graph: 'g', focus: 'f'}
    })
    await loader.load('A')
    await loader.load('A')
    expect(calls).toBe(1)
  })

  it('clears the old person on error and allows a retry', async () => {
    let fail = false
    const loader = new NeighborhoodLoader(async id =>
      fail ? {error: 'boom'} : {graph: `g${id}`, focus: id}
    )
    await loader.load('A')
    fail = true
    await loader.load('B')
    expect(loader.state).toMatchObject({graph: null, focus: '', error: 'boom'})
    fail = false
    await loader.load('B')
    expect(loader.state).toMatchObject({graph: 'gB', focus: 'B', error: ''})
  })

  it('shows the empty state without a start person and leaves it again', async () => {
    const loader = new NeighborhoodLoader(async id => ({graph: 'g', focus: id}))
    await loader.load('A')
    await loader.load('')
    expect(loader.state).toMatchObject({noStart: true, graph: null, focus: ''})
    await loader.load('A')
    expect(loader.state).toMatchObject({noStart: false, graph: 'g', focus: 'A'})
  })

  it('reports state changes to the listener', async () => {
    const seen = []
    const loader = new NeighborhoodLoader(
      async id => ({graph: 'g', focus: id}),
      state => seen.push(state.focus)
    )
    await loader.load('A')
    expect(seen.at(-1)).toBe('A')
  })
})

describe('LayoutCache', () => {
  it('returns the same layout object while the inputs are unchanged', () => {
    let builds = 0
    const cache = new LayoutCache(() => {
      builds += 1
      return {nodes: []}
    })
    const graph = {}
    const a = cache.get(graph, 'f', 'ltr')
    expect(cache.get(graph, 'f', 'ltr')).toBe(a)
    expect(builds).toBe(1)
    expect(cache.get(graph, 'f', 'ttb')).not.toBe(a)
    expect(cache.get(graph, 'g', 'ttb')).not.toBe(a)
    expect(builds).toBe(3)
  })
})

describe('isTap', () => {
  it('treats keyboard and assistive clicks as taps even after a drag', () => {
    expect(isTap({detail: 0}, 100)).toBe(true)
  })

  it('ignores a pointer click that ends a drag', () => {
    expect(isTap({detail: 1}, 100)).toBe(false)
    expect(isTap({detail: 1}, 2)).toBe(true)
  })
})
