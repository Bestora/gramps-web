// Load state of the family canvas, kept out of the component so that
// overlapping requests and errors can be tested.

export const DRAG_THRESHOLD = 5

// Whether a click on a card should select it: keyboard and assistive
// technology clicks (detail 0) always do, pointer clicks only if the pointer
// did not drag the canvas first
export function isTap(clickEvent, moved) {
  return clickEvent.detail === 0 || moved <= DRAG_THRESHOLD
}

const EMPTY = {graph: null, focus: '', error: '', noStart: false}

export class NeighborhoodLoader {
  // fetchGraph(grampsId) resolves to {graph, focus} or {error}
  constructor(fetchGraph, onChange = () => {}) {
    this._fetchGraph = fetchGraph
    this._onChange = onChange
    this._shown = null
    this._request = 0
    this.state = {...EMPTY}
  }

  _set(state) {
    this.state = state
    this._onChange(state)
  }

  async load(grampsId) {
    // already shown or on its way: a new request would discard that answer
    if (grampsId && grampsId === this._shown && !this.state.error) return
    this._request += 1
    const request = this._request
    if (!grampsId) {
      this._shown = null
      this._set({...EMPTY, noStart: true})
      return
    }
    this._shown = grampsId
    const res = await this._fetchGraph(grampsId)
    if (request !== this._request) return
    if ('error' in res) {
      this._shown = null
      this._set({...EMPTY, error: res.error})
      return
    }
    this._set({...EMPTY, graph: res.graph, focus: res.focus})
  }

  async reload() {
    if (!this._shown) return
    const grampsId = this._shown
    this._shown = null
    await this.load(grampsId)
  }
}

// Remembers the last layout, so that re-renders which do not change the
// tree keep the same object and the canvas does not recentre
export class LayoutCache {
  constructor(build) {
    this._build = build
    this._key = null
    this._value = null
  }

  get(graph, focus, orientation) {
    const key = this._key
    if (
      !key ||
      key.graph !== graph ||
      key.focus !== focus ||
      key.orientation !== orientation
    ) {
      this._key = {graph, focus, orientation}
      this._value = this._build(graph, focus, orientation)
    }
    return this._value
  }
}
