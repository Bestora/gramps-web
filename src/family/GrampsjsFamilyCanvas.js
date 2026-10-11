// src/family/GrampsjsFamilyCanvas.js
// Pannable, zoomable canvas showing a laid-out family neighbourhood.
import {html, css, svg, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {DRAG_THRESHOLD, isTap} from './loader.js'

const MIN_SCALE = 0.4
const MAX_SCALE = 2

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

class GrampsjsFamilyCanvas extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          position: relative;
          overflow: hidden;
          touch-action: none;
          background-color: var(--fm-canvas);
          background-image: radial-gradient(
            var(--fm-dot) 1.2px,
            transparent 1.2px
          );
          background-size: 22px 22px;
          cursor: grab;
        }
        :host([dragging]) {
          cursor: grabbing;
        }
        .stage {
          position: absolute;
          left: 0;
          top: 0;
          transform-origin: 0 0;
        }
        .stage.animate {
          transition: transform 0.35s ease;
        }
        svg {
          position: absolute;
          left: 0;
          top: 0;
          overflow: visible;
        }
        .card {
          position: absolute;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          background: var(--fm-card);
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          text-align: left;
          cursor: pointer;
        }
        .card:hover {
          border-color: var(--fm-moss);
        }
        .card.small {
          border-radius: 11px;
          padding: 0 10px;
          gap: 8px;
        }
        .card.focus {
          background: var(--fm-focus-bg);
          border-color: var(--fm-focus-bg);
          color: var(--fm-focus-fg);
          box-shadow: 0 0 0 6px rgba(30, 43, 36, 0.12);
        }
        .card.unknown {
          border-style: dashed;
          color: var(--fm-muted);
          cursor: default;
        }
        .face {
          position: relative;
          overflow: hidden;
          flex: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 700;
          font-size: 13px;
          background: var(--fm-leaf);
          color: var(--fm-moss);
          background-size: cover;
          background-position: center;
        }
        .face img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .small .face {
          width: 26px;
          height: 26px;
          font-size: 11px;
        }
        .focus .face {
          background-color: var(--fm-focus-face-bg);
          color: var(--fm-focus-face-fg);
        }
        .text {
          min-width: 0;
        }
        .name {
          display: block;
          font-family: var(--fm-font-name);
          font-size: 16px;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .small .name {
          font-size: 14px;
        }
        .sub {
          display: block;
          font-size: 13px;
          color: var(--fm-muted);
          white-space: nowrap;
        }
        .focus .sub {
          color: var(--fm-focus-sub);
        }
        .card.ghost {
          border: 2px dashed var(--fm-add);
          background: var(--fm-add-tint);
          color: var(--fm-add);
          font-weight: 700;
          justify-content: center;
        }
        .label {
          position: absolute;
          font-size: 13px;
          font-weight: 700;
          color: var(--fm-muted);
          white-space: nowrap;
        }
      `,
    ]
  }

  static get properties() {
    return {
      layout: {type: Object},
      cards: {type: Object},
      selected: {type: String},
      dragging: {type: Boolean, reflect: true},
      _tx: {state: true},
      _ty: {state: true},
      _scale: {state: true},
      _animate: {state: true},
    }
  }

  constructor() {
    super()
    this.layout = {nodes: [], edges: [], width: 0, height: 0}
    this.cards = new Map()
    this.selected = ''
    this.dragging = false
    this._tx = 0
    this._ty = 0
    this._scale = 1
    this._animate = false
    this._pointers = new Map()
    this._moved = 0
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('pointermove', this._onPointerMove)
    this.addEventListener('pointerup', this._onPointerUp)
    this.addEventListener('pointercancel', this._onPointerUp)
    this.addEventListener('wheel', this._onWheel, {passive: false})
  }

  updated(changed) {
    if (changed.has('layout')) {
      this.centerOn(this.selected)
    }
  }

  // Moves the canvas so that the card of `handle` is in the middle
  centerOn(handle) {
    const node = this.layout.nodes.find(
      n => n.handle === handle && n.kind !== 'label'
    )
    if (!node) return
    const {width, height} = this.getBoundingClientRect()
    this._animate = !reducedMotion()
    this._tx = width / 2 - (node.x + node.w / 2) * this._scale
    this._ty = height / 2 - (node.y + node.h / 2) * this._scale
  }

  zoomBy(factor, cx, cy) {
    const rect = this.getBoundingClientRect()
    const x = cx ?? rect.width / 2
    const y = cy ?? rect.height / 2
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._scale * factor))
    const k = scale / this._scale
    this._animate = false
    this._tx = x - (x - this._tx) * k
    this._ty = y - (y - this._ty) * k
    this._scale = scale
  }

  _onPointerDown(e) {
    this._pointers.set(e.pointerId, {x: e.clientX, y: e.clientY})
    this._moved = 0
  }

  _onPointerMove(e) {
    const prev = this._pointers.get(e.pointerId)
    if (!prev) return
    const next = {x: e.clientX, y: e.clientY}
    if (this._pointers.size === 2) {
      const [other] = [...this._pointers].filter(([id]) => id !== e.pointerId)
      const o = other[1]
      const before = Math.hypot(prev.x - o.x, prev.y - o.y)
      const after = Math.hypot(next.x - o.x, next.y - o.y)
      const rect = this.getBoundingClientRect()
      if (before > 0) {
        this.zoomBy(
          after / before,
          (next.x + o.x) / 2 - rect.left,
          (next.y + o.y) / 2 - rect.top
        )
      }
    } else {
      this._animate = false
      this._tx += next.x - prev.x
      this._ty += next.y - prev.y
    }
    this._moved += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y)
    if (this._moved > DRAG_THRESHOLD && !this.dragging) {
      // capture only once it is a drag, so taps still click the card
      this.dragging = true
      this.setPointerCapture(e.pointerId)
    }
    this._pointers.set(e.pointerId, next)
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId)
    if (!this._pointers.size) this.dragging = false
  }

  _onWheel(e) {
    e.preventDefault()
    const rect = this.getBoundingClientRect()
    this.zoomBy(
      e.deltaY < 0 ? 1.1 : 1 / 1.1,
      e.clientX - rect.left,
      e.clientY - rect.top
    )
  }

  _select(e, handle) {
    // a drag that ends on a card is not a tap
    if (!handle || !isTap(e, this._moved)) return
    fireEvent(this, 'family:select', {handle})
  }

  _subtitle(node, card) {
    if (node.kind === 'person' && node.childCount) {
      return node.childCount === 1
        ? this._('1 child')
        : this._('%s children', node.childCount)
    }
    return card?.years ?? ''
  }

  _renderLabel(node) {
    const partner = node.partner ? this.cards.get(node.partner) : null
    const text = partner
      ? this._('with %s', partner.givenName || partner.name)
      : this._('Children')
    return html`<div
      class="label"
      style="left:${node.x}px;top:${node.y}px;width:${node.w}px"
    >
      ${text}
    </div>`
  }

  _renderCard(node) {
    if (node.kind === 'label') return this._renderLabel(node)
    if (node.kind === 'ghost') {
      const text =
        node.relation === 'parent'
          ? this._('+ Mother or father')
          : this._('+ Child')
      return html`<button
        class="card ghost"
        style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px"
        @click="${e => {
          if (isTap(e, this._moved)) {
            fireEvent(this, 'family:add', {relation: node.relation})
          }
        }}"
      >
        ${text}
      </button>`
    }
    const card = node.handle ? this.cards.get(node.handle) : null
    const kind =
      node.handle === this.selected && node.kind !== 'small'
        ? 'focus'
        : node.kind
    // initials stay underneath, so a missing photo file still shows them
    const face = html`<span class="face"
      >${card?.initials ?? '?'}${card?.imageUrl
        ? html`<img
            src="${card.imageUrl}"
            alt=""
            @error="${e => e.target.remove()}"
          />`
        : ''}</span
    >`
    const name = node.kind === 'unknown' ? this._('Unknown') : card?.name
    return html`<button
      class="card ${kind}"
      style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px"
      title="${name ?? ''}"
      ?disabled="${node.kind === 'unknown'}"
      aria-current="${node.handle === this.selected ? 'true' : 'false'}"
      @click="${e => this._select(e, node.handle)}"
    >
      ${face}
      <span class="text">
        <span class="name">${name}</span>
        ${node.kind === 'small'
          ? ''
          : html`<span class="sub">${this._subtitle(node, card)}</span>`}
      </span>
    </button>`
  }

  render() {
    const {nodes, edges, width, height} = this.layout
    return html`<div
      class="stage ${this._animate ? 'animate' : ''}"
      style="width:${width}px;height:${height}px;transform:translate(${this
        ._tx}px, ${this._ty}px) scale(${this._scale})"
    >
      <svg width="${width}" height="${height}" aria-hidden="true">
        ${edges.map(
          e => svg`<polyline
            points="${e.points.map(p => p.join(',')).join(' ')}"
            fill="none" stroke="var(--fm-line)" stroke-width="2"
            stroke-linejoin="round"></polyline>`
        )}
      </svg>
      ${nodes.map(node => this._renderCard(node))}
    </div>`
  }
}

window.customElements.define('grampsjs-family-canvas', GrampsjsFamilyCanvas)
