// src/family/GrampsjsFamilyPersonForm.js
// Short form for adding or editing a person in the family UI.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {parseDateInput, formatDateInput} from './dates.js'
import {searchPeopleUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyPlaceInput.js'

const emptyEvent = {date: null, place: '', placeName: ''}

export const emptyValues = () => ({
  given: '',
  surname: '',
  birthName: '',
  callName: '',
  occupation: '',
  memory: '',
  birth: {...emptyEvent},
  death: {...emptyEvent},
  alive: true,
})

class GrampsjsFamilyPersonForm extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .switch {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 44px;
          margin-bottom: 8px;
        }
        .switch input {
          width: 22px;
          height: 22px;
        }
        .dupe {
          background: var(--fm-add-tint);
          border-radius: 14px;
          padding: 10px 12px;
          margin-bottom: 12px;
        }
        .dupe b {
          display: block;
          margin-bottom: 6px;
          font-size: 15px;
        }
        .dupe button {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 44px;
          border: none;
          border-radius: 10px;
          background: var(--fm-card);
          padding: 6px 10px;
          margin-top: 4px;
          cursor: pointer;
          text-align: left;
        }
        .dupe em {
          font-style: normal;
          font-weight: 700;
          color: var(--fm-add);
        }
        details {
          margin: 4px 0 12px;
        }
        summary {
          min-height: 44px;
          display: flex;
          align-items: center;
          font-weight: 700;
          color: var(--fm-moss);
          cursor: pointer;
        }
        textarea.input {
          min-height: 96px;
          resize: vertical;
        }
      `,
    ]
  }

  static get properties() {
    return {
      mode: {type: String},
      partners: {type: Array},
      genderChoice: {type: Array},
      values: {type: Object},
      excludeHandle: {type: String},
      saving: {type: Boolean},
      _v: {state: true},
      _gender: {state: true},
      _familyHandle: {state: true},
      _dates: {state: true},
      _errors: {state: true},
      _dupes: {state: true},
    }
  }

  constructor() {
    super()
    this.mode = 'add'
    this.partners = []
    this.genderChoice = []
    this.values = emptyValues()
    this.excludeHandle = ''
    this.saving = false
    this._v = emptyValues()
    this._gender = 2
    this._familyHandle = ''
    this._dates = {birth: '', death: ''}
    this._errors = {}
    this._dupes = []
    this._dupeTimer = null
  }

  willUpdate(changed) {
    if (changed.has('values')) {
      this._v = structuredClone(this.values)
      this._dates = {
        birth: formatDateInput(this.values.birth?.date),
        death: formatDateInput(this.values.death?.date),
      }
      this._errors = {}
    }
    if (changed.has('genderChoice') && this.genderChoice.length) {
      this._gender = this.genderChoice[0].gender
    }
    if (changed.has('partners')) {
      this._familyHandle = this.partners[0]?.familyHandle ?? ''
    }
  }

  _setField(key, value) {
    this._v = {...this._v, [key]: value}
    if (this.mode === 'add' && (key === 'given' || key === 'surname')) {
      this._findDupes()
    }
  }

  _findDupes() {
    clearTimeout(this._dupeTimer)
    const query = `${this._v.given} ${this._v.surname}`.trim()
    if (query.length < 3) {
      this._dupes = []
      return
    }
    this._dupeTimer = setTimeout(async () => {
      const res = await this.appState.apiGet(
        searchPeopleUrl(query, this.appState.settings?.lang || 'en')
      )
      const current = `${this._v.given} ${this._v.surname}`.trim()
      if (current !== query || 'error' in res) return
      this._dupes = (res.data ?? [])
        .map(r => r.object)
        .filter(o => o.handle !== this.excludeHandle)
        .slice(0, 3)
    }, 300)
  }

  _submit(e) {
    e.preventDefault()
    const errors = {}
    const parsed = {}
    for (const key of ['birth', 'death']) {
      const res = parseDateInput(this._dates[key])
      if (res.error)
        errors[key] = this._('Please enter e.g. 12.03.1958 or 1958.')
      else parsed[key] = res.date
    }
    if (!this._v.given.trim() && !this._v.surname.trim()) {
      errors.name = this._('Please enter a name.')
    }
    this._errors = errors
    if (Object.keys(errors).length) return
    fireEvent(this, 'family-form:submit', {
      values: {
        ...this._v,
        birth: {...this._v.birth, date: parsed.birth},
        death: {...this._v.death, date: parsed.death},
        gender: this._gender,
        familyHandle: this._familyHandle,
      },
    })
  }

  _dateField(key, label) {
    return html`<label class="field">
      <span>${label}</span>
      <input
        class="input"
        inputmode="text"
        placeholder="${this._('e.g. 12.03.1958 or 1958')}"
        .value="${this._dates[key]}"
        aria-invalid="${Boolean(this._errors[key])}"
        @input="${e => {
          this._dates = {...this._dates, [key]: e.target.value}
        }}"
      />
      ${this._errors[key]
        ? html`<div class="error">${this._errors[key]}</div>`
        : ''}
    </label>`
  }

  _placeField(key, label) {
    const v = this._v[key]
    return html`<grampsjs-family-place-input
      class="field"
      .appState="${this.appState}"
      .label="${label}"
      .value="${{handle: v.place, name: v.placeName}}"
      @change="${e =>
        this._setField(key, {
          ...this._v[key],
          place: e.detail.value.handle,
          placeName: e.detail.value.name,
        })}"
    ></grampsjs-family-place-input>`
  }

  _chips(items, selected, onPick) {
    return html`<div class="chips field">
      ${items.map(
        item => html`<button
          type="button"
          class="chip"
          aria-pressed="${item.value === selected}"
          @click="${() => onPick(item.value)}"
        >
          ${item.label}
        </button>`
      )}
    </div>`
  }

  render() {
    const v = this._v
    return html`<form @submit="${this._submit}" novalidate>
      ${this.partners.length > 1
        ? html`<div class="field">
            <span>${this._('With whom?')}</span>
            ${this._chips(
              [
                ...this.partners.map(p => ({
                  value: p.familyHandle,
                  label: p.name,
                })),
                {value: '', label: this._('someone else')},
              ],
              this._familyHandle,
              value => {
                this._familyHandle = value
              }
            )}
          </div>`
        : ''}
      ${this.genderChoice.length
        ? this._chips(
            this.genderChoice.map(g => ({value: g.gender, label: g.label})),
            this._gender,
            value => {
              this._gender = value
            }
          )
        : ''}
      <div class="row2">
        <label class="field">
          <span>${this._('First name')}</span>
          <input
            class="input"
            autocomplete="off"
            .value="${v.given}"
            aria-invalid="${Boolean(this._errors.name)}"
            @input="${e => this._setField('given', e.target.value)}"
          />
        </label>
        <label class="field">
          <span>${this._('Last name')}</span>
          <input
            class="input"
            autocomplete="off"
            .value="${v.surname}"
            @input="${e => this._setField('surname', e.target.value)}"
          />
        </label>
      </div>
      ${this._errors.name
        ? html`<div class="error">${this._errors.name}</div>`
        : ''}
      ${this._dupes.length
        ? html`<div class="dupe">
            <b>${this._('Do you mean this person?')}</b>
            ${this._dupes.map(o => {
              const card = personCard(o)
              return html`<button
                type="button"
                @click="${() =>
                  fireEvent(this, 'family-form:link', {handle: o.handle})}"
              >
                <span>${card.name} <small>${card.years}</small></span>
                <em>${this._('Link this person')}</em>
              </button>`
            })}
          </div>`
        : ''}
      ${this.mode === 'edit'
        ? html`<label class="field">
            <span>${this._('Birth name')}</span>
            <input
              class="input"
              .value="${v.birthName}"
              @input="${e => this._setField('birthName', e.target.value)}"
            />
          </label>`
        : ''}
      <div class="row2">
        ${this._dateField('birth', this._('Born on'))}
        ${this._placeField('birth', this._('Born in'))}
      </div>
      <label class="switch">
        <span>${this._('Still alive')}</span>
        <input
          type="checkbox"
          .checked="${v.alive}"
          @change="${e => {
            // a hidden death date must not block saving
            if (e.target.checked) this._dates = {...this._dates, death: ''}
            this._setField('alive', e.target.checked)
          }}"
        />
      </label>
      ${v.alive
        ? ''
        : html`<div class="row2">
            ${this._dateField('death', this._('Died on'))}
            ${this._placeField('death', this._('Died in'))}
          </div>`}
      ${this.mode === 'edit'
        ? html`<details>
            <summary>${this._('More details')}</summary>
            <label class="field">
              <span>${this._('Call name')}</span>
              <input
                class="input"
                .value="${v.callName}"
                @input="${e => this._setField('callName', e.target.value)}"
              />
            </label>
            <label class="field">
              <span>${this._('Occupation')}</span>
              <input
                class="input"
                .value="${v.occupation}"
                @input="${e => this._setField('occupation', e.target.value)}"
              />
            </label>
            <label class="field">
              <span>${this._('Add a memory')}</span>
              <textarea
                class="input"
                .value="${v.memory}"
                @input="${e => this._setField('memory', e.target.value)}"
              ></textarea>
            </label>
          </details>`
        : ''}
      <button class="primary" type="submit" ?disabled="${this.saving}">
        ${this.mode === 'edit' ? this._('Save changes') : this._('Add person')}
      </button>
    </form>`
  }
}

window.customElements.define(
  'grampsjs-family-person-form',
  GrampsjsFamilyPersonForm
)
