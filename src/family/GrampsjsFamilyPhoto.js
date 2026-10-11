// src/family/GrampsjsFamilyPhoto.js
// "Foto hochladen": camera or gallery, who is in it, when, profile picture.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent, fileWithMimeType} from '../util.js'
import {parseDateInput} from './dates.js'
import {withMediaRef} from './media.js'
import {fireUndo} from './saveHelpers.js'
import {searchPeopleUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyDialog.js'

class GrampsjsFamilyPhoto extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .preview {
          width: 100%;
          max-height: 260px;
          object-fit: contain;
          border-radius: 14px;
          background: var(--fm-leaf);
          margin-bottom: 12px;
        }
        .pick {
          display: grid;
          place-items: center;
          min-height: 160px;
          border: 2px dashed var(--fm-border);
          border-radius: 14px;
          margin-bottom: 12px;
          cursor: pointer;
          font-weight: 700;
          color: var(--fm-moss);
        }
        .pick input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
        }
        .results {
          list-style: none;
          margin: 4px 0 0;
          padding: 0;
        }
        .results button {
          width: 100%;
          min-height: 44px;
          text-align: left;
          border: none;
          background: var(--fm-leaf);
          border-radius: 10px;
          padding: 0 10px;
          margin-top: 4px;
          cursor: pointer;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          margin-bottom: 12px;
        }
        .check input {
          width: 22px;
          height: 22px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      focusPerson: {type: Object},
      _file: {state: true},
      _preview: {state: true},
      _people: {state: true},
      _query: {state: true},
      _results: {state: true},
      _when: {state: true},
      _desc: {state: true},
      _profile: {state: true},
      _error: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.focusPerson = null
    this._reset()
  }

  _reset() {
    if (this._preview) URL.revokeObjectURL(this._preview)
    this._file = null
    this._preview = ''
    this._people = []
    this._query = ''
    this._results = []
    this._when = ''
    this._desc = ''
    this._profile = false
    this._error = ''
    this._saving = false
  }

  willUpdate(changed) {
    if (changed.has('open') && this.open) {
      this._reset()
      if (this.focusPerson) {
        this._people = [
          {
            handle: this.focusPerson.handle,
            name: personCard(this.focusPerson).name,
          },
        ]
      }
    }
  }

  _onFile(e) {
    const [file] = e.target.files
    if (!file) return
    if (this._preview) URL.revokeObjectURL(this._preview)
    this._file = file
    this._preview = URL.createObjectURL(file)
  }

  async _search(e) {
    this._query = e.target.value
    const query = this._query.trim()
    if (query.length < 2) {
      this._results = []
      return
    }
    const res = await this.appState.apiGet(
      searchPeopleUrl(query, this.appState.settings?.lang || 'en')
    )
    if (this._query.trim() !== query) return
    this._results = 'error' in res ? [] : (res.data ?? []).map(r => r.object)
  }

  _addPerson(object) {
    if (!this._people.some(p => p.handle === object.handle)) {
      this._people = [
        ...this._people,
        {handle: object.handle, name: personCard(object).name},
      ]
    }
    this._query = ''
    this._results = []
  }

  async _save() {
    const when = parseDateInput(this._when)
    if (when.error) {
      this._error = this._('Please enter e.g. 12.03.1958 or 1958.')
      return
    }
    if (!this._file || !this._people.length) return
    this._saving = true
    const uploaded = await this.appState.apiPost(
      '/api/media/',
      fileWithMimeType(this._file),
      {isJson: false, dbChanged: false}
    )
    if ('error' in uploaded) return this._fail(uploaded.error)
    const transaction = [...(uploaded.data ?? [])]
    const media = uploaded.data[0].new
    const update = {...media, _class: 'Media', desc: this._desc.trim()}
    if (when.date) update.date = when.date
    const put = await this.appState.apiPut(
      `/api/media/${media.handle}`,
      update,
      {
        dbChanged: false,
      }
    )
    if ('error' in put) return this._fail(put.error, transaction)
    transaction.push(...(put.data ?? []))
    for (const [index, p] of this._people.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.appState.apiGet(`/api/people/${p.handle}`)
      if ('error' in res) return this._fail(res.error, transaction)
      const {extended, profile, backlinks, formatted, ...person} = res.data
      const asProfile = this._profile && index === 0
      // eslint-disable-next-line no-await-in-loop
      const saved = await this.appState.apiPut(`/api/people/${p.handle}`, {
        _class: 'Person',
        ...person,
        media_list: withMediaRef(person.media_list, media.handle, asProfile),
      })
      if ('error' in saved) return this._fail(saved.error, transaction)
      transaction.push(...(saved.data ?? []))
    }
    fireUndo(
      this,
      this._('Photo saved'),
      transaction,
      `person/${this.focusPerson?.gramps_id ?? ''}`
    )
    this._saving = false
    fireEvent(this, 'family-dialog:close')
    return undefined
  }

  // whatever was already saved stays; it is offered for undo with the error
  _fail(message, transaction = []) {
    this._saving = false
    if (transaction.length) {
      fireEvent(this, 'db:changed')
      fireUndo(
        this,
        this._(message),
        transaction,
        `person/${this.focusPerson?.gramps_id ?? ''}`
      )
      return
    }
    fireEvent(this, 'grampsjs:error', {message: this._(message)})
  }

  render() {
    const firstName = this._people[0]?.name ?? ''
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._('New photo')}"
    >
      ${this._preview
        ? html`<img class="preview" src="${this._preview}" alt="" />`
        : html`<label class="pick">
            ${this._('Take or choose a photo')}
            <input type="file" accept="image/*" @change="${this._onFile}" />
          </label>`}
      <div class="field">
        <span>${this._('Who is in the photo?')}</span>
        <div class="chips">
          ${this._people.map(
            p => html`<button
              type="button"
              class="chip"
              aria-label="${this._('Remove %s', p.name)}"
              @click="${() => {
                this._people = this._people.filter(x => x.handle !== p.handle)
              }}"
            >
              ${p.name} ✕
            </button>`
          )}
        </div>
        <input
          class="input"
          style="margin-top:8px"
          placeholder="${this._('Add person')}"
          .value="${this._query}"
          @input="${this._search}"
        />
        ${this._results.length
          ? html`<ul class="results">
              ${this._results.map(
                o => html`<li>
                  <button type="button" @click="${() => this._addPerson(o)}">
                    ${personCard(o).name} <small>${personCard(o).years}</small>
                  </button>
                </li>`
              )}
            </ul>`
          : ''}
      </div>
      <label class="field">
        <span>${this._('When, roughly?')}</span>
        <input
          class="input"
          placeholder="${this._('e.g. 1958')}"
          .value="${this._when}"
          aria-invalid="${Boolean(this._error)}"
          @input="${e => {
            this._when = e.target.value
            this._error = ''
          }}"
        />
        ${this._error ? html`<div class="error">${this._error}</div>` : ''}
      </label>
      <label class="field">
        <span>${this._('What does it show? (optional)')}</span>
        <input
          class="input"
          .value="${this._desc}"
          @input="${e => {
            this._desc = e.target.value
          }}"
        />
      </label>
      ${firstName
        ? html`<label class="check">
            <input
              type="checkbox"
              .checked="${this._profile}"
              @change="${e => {
                this._profile = e.target.checked
              }}"
            />
            ${this._('Use as profile picture of %s', firstName)}
          </label>`
        : ''}
      <button
        class="primary"
        ?disabled="${this._saving || !this._file || !this._people.length}"
        @click="${this._save}"
      >
        ${this._('Save photo')}
      </button>
    </grampsjs-family-dialog>`
  }
}

window.customElements.define('grampsjs-family-photo', GrampsjsFamilyPhoto)
