// src/family/GrampsjsFamilyApp.js
// Shell of the family UI: canvas, floating controls and details.
import {html, css, LitElement} from 'lit'
import {
  mdiMagnify,
  mdiAccountCircle,
  mdiPlus,
  mdiMinus,
  mdiSitemapOutline,
} from '@mdi/js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import '../components/GrampsjsIcon.js'
import {familyStyles} from './familyStyles.js'
import {buildNeighborhood} from './neighborhood.js'
import {layoutNeighborhood, ORIENTATION_LTR, ORIENTATION_TTB} from './layout.js'
import {personCard} from './personCard.js'
import {
  fetchNeighborhoodGraph,
  fetchGrampsId,
  searchPeopleUrl,
} from './familyApi.js'
import {
  canSwitchUiMode,
  setUiModeOverride,
  UI_MODE_FULL,
  TREE_CONFIG_USER_PERSONS,
} from './uiMode.js'
import './GrampsjsFamilyCanvas.js'
import './GrampsjsFamilyDetails.js'

const ORIENTATION_KEY = 'grampsjs_family_orientation'

function readOrientation() {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === ORIENTATION_TTB
      ? ORIENTATION_TTB
      : ORIENTATION_LTR
  } catch (e) {
    return ORIENTATION_LTR
  }
}

class GrampsjsFamilyApp extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: grid;
          grid-template-columns: 1fr 340px;
          height: 100vh;
          height: 100dvh;
          background: var(--fm-paper);
        }
        .main {
          position: relative;
          min-width: 0;
        }
        grampsjs-family-canvas {
          position: absolute;
          inset: 0;
        }
        grampsjs-family-details {
          border-left: 1px solid var(--fm-leaf);
          padding: 24px;
          overflow-y: auto;
        }
        .top {
          position: absolute;
          top: 16px;
          left: 16px;
          right: 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          pointer-events: none;
        }
        .top > * {
          pointer-events: auto;
        }
        .search {
          position: relative;
          flex: 1;
          max-width: 420px;
          margin: 0 auto;
        }
        .search label {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 46px;
          border-radius: 999px;
          padding: 0 16px;
        }
        .search input {
          flex: 1;
          min-width: 0;
          border: none;
          background: none;
          font: inherit;
          font-size: 16px;
          color: var(--fm-ink);
          outline: none;
        }
        .results {
          position: absolute;
          left: 0;
          right: 0;
          top: 52px;
          margin: 0;
          padding: 6px;
          list-style: none;
          border-radius: 16px;
        }
        .results button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 10px;
          padding: 6px 10px;
          cursor: pointer;
        }
        .results button:hover {
          background: var(--fm-leaf);
        }
        .results small {
          display: block;
          color: var(--fm-muted);
        }
        .seg {
          display: flex;
          gap: 2px;
          padding: 3px;
          border-radius: 12px;
        }
        .seg button,
        .icon-btn {
          width: 44px;
          height: 40px;
          display: grid;
          place-items: center;
          border: none;
          border-radius: 9px;
          background: none;
          cursor: pointer;
        }
        .seg button[aria-pressed='true'] {
          background: var(--fm-ink);
          color: var(--fm-paper);
        }
        .account {
          position: relative;
        }
        .menu {
          position: absolute;
          right: 0;
          top: 50px;
          min-width: 220px;
          border-radius: 14px;
          padding: 6px;
        }
        .menu button {
          display: block;
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: none;
          border-radius: 10px;
          padding: 0 12px;
          cursor: pointer;
        }
        .menu button:hover {
          background: var(--fm-leaf);
        }
        .zoom {
          position: absolute;
          right: 16px;
          bottom: 16px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
        }
        .empty {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 24px;
          color: var(--fm-muted);
        }
        @media (max-width: 991px) {
          :host {
            grid-template-columns: 1fr;
          }
          grampsjs-family-details {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            max-height: 70vh;
            border-left: none;
            z-index: 2;
          }
          .zoom {
            display: none;
          }
          .top {
            flex-wrap: wrap;
            top: 12px;
            left: 12px;
            right: 12px;
          }
          .search {
            order: -1;
            flex-basis: 100%;
            max-width: none;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      _graph: {state: true},
      _focus: {state: true},
      _orientation: {state: true},
      _query: {state: true},
      _results: {state: true},
      _menuOpen: {state: true},
      _error: {state: true},
      _noStart: {state: true},
    }
  }

  constructor() {
    super()
    this._graph = null
    this._focus = ''
    this._orientation = readOrientation()
    this._query = ''
    this._results = []
    this._menuOpen = false
    this._error = ''
    this._noStart = false
    this._loadedId = null
    this._searchTimer = null
  }

  get _locale() {
    return this.appState.settings?.lang || 'en'
  }

  updated(changed) {
    if (changed.has('appState')) {
      this._loadForPath()
    }
  }

  async _myGrampsId() {
    const username = this.appState.user?.name
    const handle =
      this.appState.treeConfig?.[TREE_CONFIG_USER_PERSONS]?.[username]
    if (handle) {
      const id = await fetchGrampsId(this.appState.apiGet, handle)
      if (id) return id
    }
    return this.appState.settings?.homePerson || ''
  }

  async _loadForPath() {
    const {page, pageId} = this.appState.path
    const grampsId =
      page === 'person' && pageId ? pageId : await this._myGrampsId()
    if (!grampsId) {
      this._noStart = true
      return
    }
    if (grampsId === this._loadedId) return
    this._loadedId = grampsId
    this._noStart = false
    const res = await fetchNeighborhoodGraph(
      this.appState.apiGet,
      grampsId,
      this._locale
    )
    if ('error' in res) {
      this._error = res.error
      fireEvent(this, 'grampsjs:error', {message: res.error})
      return
    }
    this._error = ''
    this._graph = res.graph
    this._focus = res.focus
  }

  _select(e) {
    const person = this._graph?.person(e.detail.handle)
    if (person && person.handle !== this._focus) {
      fireEvent(this, 'nav', {path: `person/${person.gramps_id}`})
    }
  }

  _toMe() {
    fireEvent(this, 'nav', {path: ''})
  }

  _setOrientation(orientation) {
    this._orientation = orientation
    try {
      localStorage.setItem(ORIENTATION_KEY, orientation)
    } catch (e) {
      // ignore
    }
  }

  _onSearchInput(e) {
    this._query = e.target.value
    clearTimeout(this._searchTimer)
    if (this._query.trim().length < 2) {
      this._results = []
      return
    }
    this._searchTimer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        searchPeopleUrl(this._query.trim(), this._locale)
      )
      this._results = 'error' in res ? [] : res.data ?? []
    }, 250)
  }

  _openResult(result) {
    this._query = ''
    this._results = []
    fireEvent(this, 'nav', {path: `person/${result.object.gramps_id}`})
  }

  _switchToFull() {
    setUiModeOverride(UI_MODE_FULL)
    fireEvent(window, 'uimode:changed')
  }

  _cards() {
    const cards = new Map()
    for (const person of this._graph?.people() ?? []) {
      cards.set(person.handle, personCard(person))
    }
    return cards
  }

  _relatives(cards) {
    const n = buildNeighborhood(this._graph, this._focus)
    const name = h => cards.get(h)?.name
    return {
      parents: [n.parents.father, n.parents.mother].filter(Boolean).map(name),
      partners: n.partners
        .map(p => p.partner)
        .filter(Boolean)
        .map(name),
      children: n.partners.reduce((sum, p) => sum + p.children.length, 0),
    }
  }

  _renderSearch() {
    return html`<div class="search">
      <label class="float">
        <grampsjs-icon
          path="${mdiMagnify}"
          color="var(--fm-muted)"
        ></grampsjs-icon>
        <input
          type="search"
          .value="${this._query}"
          placeholder="${this._('Search person')}"
          aria-label="${this._('Search person')}"
          @input="${this._onSearchInput}"
        />
      </label>
      ${this._results.length
        ? html`<ul class="results float">
            ${this._results.map(r => {
              const card = personCard(r.object)
              return html`<li>
                <button @click="${() => this._openResult(r)}">
                  ${card.name}<small>${card.years}</small>
                </button>
              </li>`
            })}
          </ul>`
        : ''}
    </div>`
  }

  _renderAccount() {
    return html`<div class="account">
      <button
        class="icon-btn float"
        style="border-radius:999px"
        aria-label="${this._('Account')}"
        aria-expanded="${this._menuOpen}"
        @click="${() => {
          this._menuOpen = !this._menuOpen
        }}"
      >
        <grampsjs-icon
          path="${mdiAccountCircle}"
          color="currentColor"
        ></grampsjs-icon>
      </button>
      ${this._menuOpen
        ? html`<div class="menu float">
            ${canSwitchUiMode(this.appState.user?.role)
              ? html`<button @click="${this._switchToFull}">
                  ${this._('Switch to full view')}
                </button>`
              : ''}
            <button @click="${() => this.appState.signout()}">
              ${this._('Log out')}
            </button>
          </div>`
        : ''}
    </div>`
  }

  render() {
    const cards = this._cards()
    const ready = this._graph && this._focus
    const layout = ready
      ? layoutNeighborhood(
          buildNeighborhood(this._graph, this._focus),
          this._orientation
        )
      : {nodes: [], edges: [], width: 0, height: 0}
    return html`
      <div class="main">
        <grampsjs-family-canvas
          .appState="${this.appState}"
          .layout="${layout}"
          .cards="${cards}"
          .selected="${this._focus}"
          @family:select="${this._select}"
        ></grampsjs-family-canvas>
        ${this._noStart
          ? html`<div class="empty">
              ${this._('Search for a person to get started.')}
            </div>`
          : ''}
        <div class="top">
          <button class="pill float" @click="${this._toMe}">
            ${this._('To me')}
          </button>
          ${this._renderSearch()}
          <div
            class="seg float"
            role="group"
            aria-label="${this._('Direction')}"
          >
            <button
              aria-pressed="${this._orientation === ORIENTATION_TTB}"
              aria-label="${this._('Top to bottom')}"
              @click="${() => this._setOrientation(ORIENTATION_TTB)}"
            >
              <grampsjs-icon
                path="${mdiSitemapOutline}"
                color="currentColor"
              ></grampsjs-icon>
            </button>
            <button
              aria-pressed="${this._orientation === ORIENTATION_LTR}"
              aria-label="${this._('Left to right')}"
              @click="${() => this._setOrientation(ORIENTATION_LTR)}"
            >
              <grampsjs-icon
                path="${mdiSitemapOutline}"
                rotate="-90"
                color="currentColor"
              ></grampsjs-icon>
            </button>
          </div>
          ${this._renderAccount()}
        </div>
        <div class="zoom float">
          <button
            class="icon-btn"
            aria-label="${this._('Zoom in')}"
            @click="${() =>
              this.renderRoot
                .querySelector('grampsjs-family-canvas')
                .zoomBy(1.2)}"
          >
            <grampsjs-icon
              path="${mdiPlus}"
              color="currentColor"
            ></grampsjs-icon>
          </button>
          <button
            class="icon-btn"
            aria-label="${this._('Zoom out')}"
            @click="${() =>
              this.renderRoot
                .querySelector('grampsjs-family-canvas')
                .zoomBy(1 / 1.2)}"
          >
            <grampsjs-icon
              path="${mdiMinus}"
              color="currentColor"
            ></grampsjs-icon>
          </button>
        </div>
      </div>
      <grampsjs-family-details
        .appState="${this.appState}"
        .card="${ready ? cards.get(this._focus) : null}"
        .relatives="${ready ? this._relatives(cards) : undefined}"
      ></grampsjs-family-details>
    `
  }
}

window.customElements.define('grampsjs-family-app', GrampsjsFamilyApp)
