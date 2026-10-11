// src/family/GrampsjsFamilyOnboarding.js
// First login: find the account's own person by name, or add it.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {searchPeopleUrl} from './familyApi.js'
import {matchPeopleByName, setOnboardingDone} from './me.js'
import {personCard} from './personCard.js'
import {buildNewPerson, GENDER} from './personPayload.js'
import {ensurePlaces} from './saveHelpers.js'
import {emptyValues} from './GrampsjsFamilyPersonForm.js'
import './GrampsjsFamilyDialog.js'

class GrampsjsFamilyOnboarding extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .option {
          display: block;
          width: 100%;
          min-height: 56px;
          text-align: left;
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          background: var(--fm-card);
          padding: 8px 14px;
          margin-bottom: 8px;
          cursor: pointer;
        }
        .option b {
          font-family: var(--fm-font-name);
          font-weight: 600;
        }
        .option small {
          display: block;
          color: var(--fm-muted);
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      force: {type: Boolean},
      _state: {state: true},
      _candidates: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.force = false
    this._state = 'loading'
    this._candidates = []
    this._saving = false
  }

  async updated(changed) {
    if (changed.has('open') && this.open) await this._find()
  }

  get _fullName() {
    return this.appState.user?.full_name || this.appState.user?.name || ''
  }

  async _find() {
    this._state = 'loading'
    const res = await this.appState.apiGet(
      searchPeopleUrl(this._fullName, this.appState.settings?.lang || 'en')
    )
    const people = 'error' in res ? [] : (res.data ?? []).map(r => r.object)
    const {exact, partial} = matchPeopleByName(people, this._fullName)
    if (exact.length === 1 && !this.force) {
      await this._choose(exact[0].handle, personCard(exact[0]).name)
      return
    }
    this._candidates = [...exact, ...partial]
    this._state = this._candidates.length ? 'choose' : 'none'
  }

  async _choose(handle, name) {
    const res = await this.appState.apiPut(
      '/api/users/-/person/',
      {handle},
      {
        dbChanged: false,
      }
    )
    if ('error' in res) {
      fireEvent(this, 'grampsjs:error', {message: res.error})
      return
    }
    setOnboardingDone(this.appState.user?.name)
    if (name) {
      fireEvent(this, 'grampsjs:notification', {
        message: this._('You are linked to %s.', name),
      })
    }
    fireEvent(this, 'family-onboarding:done', {handle})
  }

  _later() {
    setOnboardingDone(this.appState.user?.name)
    fireEvent(this, 'family-onboarding:done', {handle: ''})
  }

  async _addMe(e) {
    this._saving = true
    const places = await ensurePlaces(this.appState, e.detail.values)
    if ('error' in places) return this._fail(places.error)
    const objects = buildNewPerson({
      ...places.values,
      gender: e.detail.values.gender,
    })
    const res = await this.appState.apiPost('/api/objects/', objects)
    if ('error' in res) return this._fail(res.error)
    this._saving = false
    await this._choose(objects[0].handle, '')
    return undefined
  }

  _fail(message) {
    this._saving = false
    fireEvent(this, 'grampsjs:error', {message})
  }

  _initial() {
    const [given = '', ...rest] = this._fullName.trim().split(/\s+/)
    return {...emptyValues(), given, surname: rest.join(' ')}
  }

  _body() {
    if (this._state === 'loading') return html`<p>${this._('Loading')}</p>`
    if (this._state === 'add') {
      return html`<grampsjs-family-person-form
        .appState="${this.appState}"
        mode="add"
        .values="${this._initial()}"
        .genderChoice="${[
          {gender: GENDER.FEMALE, label: this._('Woman')},
          {gender: GENDER.MALE, label: this._('Man')},
        ]}"
        ?saving="${this._saving}"
        @family-form:submit="${this._addMe}"
      ></grampsjs-family-person-form>`
    }
    const actions = html`<div class="actions">
      <button
        class="secondary"
        @click="${() => {
          this._state = 'add'
        }}"
      >
        ${this._('Add me')}
      </button>
      <button class="secondary" @click="${this._later}">
        ${this._('Later')}
      </button>
    </div>`
    if (this._state === 'none') {
      return html`<p>${this._('You are not in the tree yet.')}</p>
        ${actions}`
    }
    return html`<p>${this._('Which person are you?')}</p>
      ${this._candidates.map(o => {
        const card = personCard(o)
        return html`<button
          class="option"
          @click="${() => this._choose(o.handle, card.name)}"
        >
          <b>${card.name}</b><small>${card.years}</small>
        </button>`
      })}
      ${actions}`
  }

  render() {
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._('Welcome!')}"
      @family-dialog:close="${this._later}"
    >
      ${this._body()}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-onboarding',
  GrampsjsFamilyOnboarding
)
