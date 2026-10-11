// src/family/GrampsjsFamilyPlaceInput.js
// Text field with place suggestions; typing a name that is not in the tree
// keeps it as a new place to be created on save.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {placeSearchUrl, placeTitle} from './places.js'

class GrampsjsFamilyPlaceInput extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          position: relative;
        }
        ul {
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          z-index: 3;
          margin: 4px 0 0;
          padding: 6px;
          list-style: none;
          background: var(--fm-card);
          border-radius: 12px;
          box-shadow: 0 10px 24px -10px rgba(20, 40, 30, 0.45);
        }
        li button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 8px;
          padding: 0 10px;
          cursor: pointer;
        }
        li button:hover {
          background: var(--fm-leaf);
        }
        .new {
          font-size: 13px;
          color: var(--fm-muted);
          margin-top: 2px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      label: {type: String},
      value: {type: Object},
      _results: {state: true},
    }
  }

  constructor() {
    super()
    this.label = ''
    this.value = {handle: '', name: ''}
    this._results = []
    this._timer = null
  }

  _set(value) {
    this.value = value
    fireEvent(this, 'change', {value})
  }

  _onInput(e) {
    const name = e.target.value
    this._set({handle: '', name})
    clearTimeout(this._timer)
    if (name.trim().length < 2) {
      this._results = []
      return
    }
    this._timer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        placeSearchUrl(name.trim(), this.appState.settings?.lang || 'en')
      )
      if (this.value.name !== name) return
      this._results = 'error' in res ? [] : res.data ?? []
    }, 250)
  }

  _pick(result) {
    clearTimeout(this._timer)
    this._results = []
    this._set({handle: result.handle, name: placeTitle(result.object)})
  }

  render() {
    return html`
      <label class="field">
        <span>${this.label}</span>
        <input
          class="input"
          .value="${this.value?.name ?? ''}"
          placeholder="${this._('Search place')}"
          autocomplete="off"
          @input="${this._onInput}"
          @keydown="${e => {
            if (e.key === 'Escape' && this._results.length) {
              e.stopPropagation()
              this._results = []
            }
          }}"
        />
      </label>
      ${this.value?.name && !this.value.handle && !this._results.length
        ? html`<div class="new">${this._('New place')}</div>`
        : ''}
      ${this._results.length
        ? html`<ul>
            ${this._results.map(
              r => html`<li>
                <button type="button" @click="${() => this._pick(r)}">
                  ${placeTitle(r.object)}
                </button>
              </li>`
            )}
          </ul>`
        : ''}
    `
  }
}

window.customElements.define(
  'grampsjs-family-place-input',
  GrampsjsFamilyPlaceInput
)
