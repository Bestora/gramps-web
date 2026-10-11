// src/family/GrampsjsFamilyEditPerson.js
// "Angaben ändern": prefilled short form, saved as person and event updates.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {editValues, buildPersonEdit, rebaseEdit} from './personEdit.js'
import {ensurePlaces, fireUndo} from './saveHelpers.js'
import {personUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import {connectionsOf} from './connections.js'
import {unlinkRelative} from './relatives.js'
import {familyStyles} from './familyStyles.js'
import './GrampsjsFamilyDialog.js'
import './GrampsjsFamilyPersonForm.js'

class GrampsjsFamilyEditPerson extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        h3 {
          font-size: 17px;
          margin: 24px 0 4px;
        }
        .hint {
          margin: 0 0 8px;
          font-size: 14px;
          color: var(--fm-muted);
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        li {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 48px;
          border-top: 1px solid var(--fm-leaf);
        }
        li span {
          flex: 1;
          min-width: 0;
        }
        li small {
          display: block;
          color: var(--fm-muted);
        }
        .unlink {
          min-height: 40px;
          border: 1.5px solid var(--fm-border);
          border-radius: 10px;
          background: var(--fm-card);
          color: var(--fm-ink);
          padding: 0 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .unlink.confirm {
          border-color: #b3261e;
          color: #b3261e;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      handle: {type: String},
      graph: {type: Object},
      _confirm: {state: true},
      _person: {state: true},
      _values: {state: true},
      _saving: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.handle = ''
    this._person = null
    this._values = null
    this._saving = false
    this.graph = null
    this._confirm = ''
  }

  // First tap asks, second tap removes the connection; the person stays
  async _unlink(connection, key) {
    if (this._confirm !== key) {
      this._confirm = key
      return
    }
    this._confirm = ''
    const res = await unlinkRelative(this.appState, connection)
    if ('error' in res) {
      fireEvent(this, 'grampsjs:error', {message: this._(res.error)})
      return
    }
    fireUndo(
      this,
      this._('Connection removed'),
      res.transaction,
      `person/${this._person?.gramps_id ?? ''}`
    )
    fireEvent(this, 'family-dialog:close')
  }

  _renderConnections() {
    if (!this.graph || !this.handle) return ''
    const label = {
      parents: this._('Parents'),
      partner: this._('Partner'),
      child: this._('Child'),
    }
    const connections = connectionsOf(this.graph, this.handle)
    if (!connections.length) return ''
    return html`<h3>${this._('Family')}</h3>
      <p class="hint">
        ${this._('Removing a connection keeps the person in the tree.')}
      </p>
      <ul>
        ${connections.map(c => {
          const key = `${c.kind}-${c.familyHandle}-${c.handle}`
          const asking = this._confirm === key
          return html`<li>
            <span>${c.name}<small>${label[c.kind]}</small></span>
            <button
              class="unlink ${asking ? 'confirm' : ''}"
              @click="${() => this._unlink(c, key)}"
            >
              ${asking ? this._('Really remove?') : this._('Remove connection')}
            </button>
          </li>`
        })}
      </ul>`
  }

  async updated(changed) {
    if (
      (changed.has('open') || changed.has('handle')) &&
      this.open &&
      this.handle
    ) {
      // no stale form of the previous person while loading
      this._person = null
      this._values = null
      const res = await this.appState.apiGet(
        personUrl(this.handle, this.appState.settings?.lang || 'en')
      )
      if ('error' in res) {
        fireEvent(this, 'grampsjs:error', {message: res.error})
        return
      }
      this._person = res.data
      this._values = editValues(res.data, res.data.extended?.events ?? [])
    }
  }

  async _save(e) {
    this._saving = true
    const places = await ensurePlaces(this.appState, e.detail.values)
    if ('error' in places) return this._fail(places.error)
    // build the update on the person as it is now, so photos, notes or
    // fields someone else changed since the form opened are kept
    const latest = await this.appState.apiGet(
      personUrl(this.handle, this.appState.settings?.lang || 'en')
    )
    if ('error' in latest) {
      return this._fail(latest.error, places.transaction)
    }
    const events = latest.data.extended?.events ?? []
    const values = rebaseEdit(
      this._values,
      places.values,
      editValues(latest.data, events)
    )
    const edit = buildPersonEdit(latest.data, events, values)
    const transaction = [...places.transaction]
    if (edit.newObjects.length) {
      const res = await this.appState.apiPost(
        '/api/objects/',
        edit.newObjects,
        {
          dbChanged: false,
        }
      )
      if ('error' in res) return this._fail(res.error, transaction)
      transaction.push(...(res.data ?? []))
    }
    for (const event of edit.updatedEvents) {
      const {extended, profile, backlinks, formatted, ...clean} = event
      // eslint-disable-next-line no-await-in-loop
      const res = await this.appState.apiPut(
        `/api/events/${event.handle}`,
        clean,
        {
          dbChanged: false,
        }
      )
      if ('error' in res) return this._fail(res.error, transaction)
      transaction.push(...(res.data ?? []))
    }
    // If-Match: nothing someone else saved since opening gets overwritten
    const res = await this.appState.apiPut(
      `/api/people/${this.handle}`,
      edit.person
    )
    if ('error' in res) return this._fail(res.error, transaction)
    transaction.push(...(res.data ?? []))
    fireUndo(
      this,
      this._('Changes saved'),
      transaction,
      `person/${this._person.gramps_id}`
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
        `person/${this._person.gramps_id}`
      )
      return
    }
    fireEvent(this, 'grampsjs:error', {message: this._(message)})
  }

  render() {
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${this._person
        ? personCard(this._person).name
        : this._('Loading')}"
    >
      ${this._values
        ? html`<grampsjs-family-person-form
            .appState="${this.appState}"
            mode="edit"
            .values="${this._values}"
            ?saving="${this._saving}"
            @family-form:submit="${this._save}"
          ></grampsjs-family-person-form>`
        : ''}
      ${this._renderConnections()}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-edit-person',
  GrampsjsFamilyEditPerson
)
