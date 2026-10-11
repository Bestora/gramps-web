// src/family/GrampsjsFamilyEditPerson.js
// "Angaben ändern": prefilled short form, saved as person and event updates.
import {html, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {editValues, buildPersonEdit} from './personEdit.js'
import {ensurePlaces, fireUndo, errorMessage} from './saveHelpers.js'
import {personUrl} from './familyApi.js'
import {personCard} from './personCard.js'
import './GrampsjsFamilyDialog.js'
import './GrampsjsFamilyPersonForm.js'

class GrampsjsFamilyEditPerson extends GrampsjsAppStateMixin(LitElement) {
  static get properties() {
    return {
      open: {type: Boolean},
      handle: {type: String},
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
      const res = await this.appState.apiGet(personUrl(this.handle))
      if ('error' in res) {
        fireEvent(this, 'grampsjs:error', {message: res.error})
        return
      }
      this._person = res.data
      this._etag = res.etag
      this._values = editValues(res.data, res.data.extended?.events ?? [])
    }
  }

  async _save(e) {
    this._saving = true
    const places = await ensurePlaces(this.appState, e.detail.values)
    if ('error' in places) return this._fail(errorMessage(places))
    const events = this._person.extended?.events ?? []
    const edit = buildPersonEdit(this._person, events, places.values)
    const transaction = [...places.transaction]
    if (edit.newObjects.length) {
      const res = await this.appState.apiPost(
        '/api/objects/',
        edit.newObjects,
        {
          dbChanged: false,
        }
      )
      if ('error' in res) return this._fail(errorMessage(res), transaction)
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
      if ('error' in res) return this._fail(errorMessage(res), transaction)
      transaction.push(...(res.data ?? []))
    }
    // If-Match: nothing someone else saved since opening gets overwritten
    const res = await this.appState.apiPut(
      `/api/people/${this.handle}`,
      edit.person,
      {ifMatch: this._etag}
    )
    if ('error' in res) return this._fail(errorMessage(res), transaction)
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
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-edit-person',
  GrampsjsFamilyEditPerson
)
