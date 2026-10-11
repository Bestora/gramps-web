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
import {familyStyles, familyTokens} from './familyStyles.js'
import {NeighborhoodLoader, LayoutCache} from './loader.js'
import {buildNeighborhood} from './neighborhood.js'
import {layoutNeighborhood, ORIENTATION_LTR, ORIENTATION_TTB} from './layout.js'
import {personCard} from './personCard.js'
import {
  fetchNeighborhoodGraph,
  fetchGrampsId,
  searchPeopleUrl,
  relationUrls,
} from './familyApi.js'
import {kinship as buildKinship} from './kinship.js'
import {myPersonHandle, onboardingDone} from './me.js'
import {canSwitchUiMode, setUiModeOverride, UI_MODE_FULL} from './uiMode.js'
import './GrampsjsFamilyCanvas.js'
import './GrampsjsFamilyDetails.js'
import './GrampsjsFamilyAddPerson.js'
import './GrampsjsFamilyEditPerson.js'
import './GrampsjsFamilyPhoto.js'
import './GrampsjsFamilyOnboarding.js'

const ORIENTATION_KEY = 'grampsjs_family_orientation'
const EMPTY_LAYOUT = {nodes: [], edges: [], width: 0, height: 0}

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
      familyTokens,
      familyStyles,
      css`
        :host {
          display: grid;
          grid-template-columns: 1fr;
          height: 100vh;
          height: 100dvh;
          background: var(--fm-paper);
        }
        :host([details]) {
          grid-template-columns: 1fr 340px;
        }
        grampsjs-family-add-person,
        grampsjs-family-edit-person,
        grampsjs-family-photo,
        grampsjs-family-onboarding {
          /* dialogs live in the top layer, not in the grid */
          position: absolute;
          width: 0;
          height: 0;
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
          pointer-events: none;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 24px;
          color: var(--fm-muted);
        }
        @media (max-width: 991px) {
          :host,
          :host([details]) {
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
      _dialog: {state: true},
      _preset: {state: true},
      _kinship: {state: true},
      _onboardingForce: {state: true},
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
    this._dialog = ''
    this._preset = ''
    this._kinship = null
    this._onboardingForce = false
    this._onDbChanged = () => this._loader.reload()
    this._loader = new NeighborhoodLoader(
      grampsId =>
        fetchNeighborhoodGraph(this.appState.apiGet, grampsId, this._locale),
      state => {
        this._graph = state.graph
        this._focus = state.focus
        this._noStart = state.noStart
        this._error = state.error
        if (state.error) {
          fireEvent(this, 'grampsjs:error', {message: state.error})
        }
        this._loadKinship()
      }
    )
    this._layoutCache = new LayoutCache((graph, focus, orientation) =>
      layoutNeighborhood(buildNeighborhood(graph, focus), orientation, {
        ghosts: Boolean(this.appState?.permissions?.canAdd),
      })
    )
    this._themeObserver = new MutationObserver(() => this._syncTheme())
    this._searchTimer = null
  }

  get _locale() {
    return this.appState.settings?.lang || 'en'
  }

  connectedCallback() {
    super.connectedCallback()
    this._syncTheme()
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    window.addEventListener('db:changed', this._onDbChanged)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._themeObserver.disconnect()
    window.removeEventListener('db:changed', this._onDbChanged)
  }

  get _me() {
    return myPersonHandle(this.appState.treeConfig, this.appState.user?.name)
  }

  _syncTheme() {
    this.toggleAttribute(
      'dark',
      document.documentElement.getAttribute('data-theme') === 'dark'
    )
  }

  willUpdate() {
    this.toggleAttribute('details', Boolean(this._graph && this._focus))
  }

  updated(changed) {
    if (!changed.has('appState')) return
    const prev = changed.get('appState')
    const now = this.appState
    // only what decides which person is shown; other appState updates
    // (strings, db info, ...) must not trigger a reload
    if (
      !prev ||
      prev.path !== now.path ||
      prev.user !== now.user ||
      prev.treeConfig !== now.treeConfig ||
      prev.settings?.homePerson !== now.settings?.homePerson
    ) {
      this._loadForPath()
    }
    const username = now.user?.name
    if (username && !this._dialog && !this._me && !onboardingDone(username)) {
      this._onboardingForce = false
      this._dialog = 'onboarding'
    }
  }

  async _loadKinship() {
    const me = this._me
    const focus = this._focus
    this._kinship = null
    if (!me || !focus || me === focus) return
    const urls = relationUrls(me, focus, this._locale)
    const [one, all] = await Promise.all([
      this.appState.apiGet(urls.one),
      this.appState.apiGet(urls.all),
    ])
    if (this._focus !== focus) return
    const names = new Map(
      (this._graph?.people() ?? []).map(p => [p.handle, personCard(p).name])
    )
    this._kinship = buildKinship(
      'error' in one ? undefined : one.data,
      'error' in all ? undefined : all.data,
      h => names.get(h) ?? ''
    )
  }

  _openAdd(relation = '') {
    this._preset = relation
    this._dialog = 'add'
  }

  _onAction(e) {
    if (e.detail.action === 'add') this._openAdd('')
    else this._dialog = e.detail.action
  }

  _closeDialog() {
    this._dialog = ''
  }

  async _onboarded(e) {
    this._dialog = ''
    if (!e.detail.handle) return
    // refresh the tree config so "To me" and kinship know the link
    const res = await this.appState.apiGet('/api/trees/-/config')
    if ('data' in res) this.appState.cacheTreeConfig(res.data)
    this._toMe()
  }

  async _myGrampsId() {
    const handle = this._me
    if (handle) {
      const id = await fetchGrampsId(this.appState.apiGet, handle)
      if (id) return id
    }
    return this.appState.settings?.homePerson || ''
  }

  async _loadForPath() {
    const {path} = this.appState
    const grampsId =
      path.page === 'person' && path.pageId
        ? path.pageId
        : await this._myGrampsId()
    // the user navigated on while the start person was being looked up
    if (this.appState.path !== path) return
    await this._loader.load(grampsId)
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
            <button
              @click="${() => {
                this._menuOpen = false
                this._onboardingForce = true
                this._dialog = 'onboarding'
              }}"
            >
              ${this._('This is not me')}
            </button>
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
      ? this._layoutCache.get(this._graph, this._focus, this._orientation)
      : EMPTY_LAYOUT
    return html`
      <div class="main">
        <grampsjs-family-canvas
          .appState="${this.appState}"
          .layout="${layout}"
          .cards="${cards}"
          .selected="${this._focus}"
          @family:select="${this._select}"
          @family:add="${e => this._openAdd(e.detail.relation)}"
        ></grampsjs-family-canvas>
        ${this._noStart || this._error
          ? html`<div class="empty">
              ${this._error || this._('Search for a person to get started.')}
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
      ${ready
        ? html`<grampsjs-family-details
            .appState="${this.appState}"
            .card="${cards.get(this._focus)}"
            .relatives="${this._relatives(cards)}"
            .kinship="${this._kinship}"
            ?isMe="${Boolean(this._me) && this._focus === this._me}"
            ?canAdd="${this.appState.permissions?.canAdd}"
            ?canEdit="${this.appState.permissions?.canEdit}"
            @family:action="${this._onAction}"
          ></grampsjs-family-details>`
        : ''}
      <grampsjs-family-add-person
        .appState="${this.appState}"
        .open="${this._dialog === 'add'}"
        .focusPerson="${this._graph?.person(this._focus) ?? null}"
        .graph="${this._graph}"
        .preset="${this._preset}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-add-person>
      <grampsjs-family-edit-person
        .appState="${this.appState}"
        .open="${this._dialog === 'edit'}"
        .handle="${this._focus}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-edit-person>
      <grampsjs-family-photo
        .appState="${this.appState}"
        .open="${this._dialog === 'photo'}"
        .focusPerson="${this._graph?.person(this._focus) ?? null}"
        @family-dialog:close="${this._closeDialog}"
      ></grampsjs-family-photo>
      <grampsjs-family-onboarding
        .appState="${this.appState}"
        .open="${this._dialog === 'onboarding'}"
        .force="${this._onboardingForce}"
        @family-onboarding:done="${this._onboarded}"
      ></grampsjs-family-onboarding>
    `
  }
}

window.customElements.define('grampsjs-family-app', GrampsjsFamilyApp)
