// src/family/GrampsjsFamilyAddPerson.js
// "Person hinzufügen": choose the relation, fill in the short form, save.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import {buildNewPerson, GENDER} from './personPayload.js'
import {
  RELATION,
  canAddParent,
  checkRelative,
  fetchFocus,
  linkRelative,
} from './relatives.js'
import {ensurePlaces, fireUndo} from './saveHelpers.js'
import {personCard} from './personCard.js'
import {emptyValues} from './GrampsjsFamilyPersonForm.js'
import './GrampsjsFamilyDialog.js'

class GrampsjsFamilyAddPerson extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        .choices {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .choice {
          min-height: 88px;
          border: 1.5px solid var(--fm-border);
          border-radius: 14px;
          background: var(--fm-card);
          padding: 12px;
          text-align: left;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
        }
        .choice small {
          display: block;
          font-weight: 400;
          font-size: 13px;
          color: var(--fm-muted);
          margin-top: 4px;
        }
        .choice:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .back {
          border: none;
          background: none;
          color: var(--fm-moss);
          font-weight: 700;
          min-height: 44px;
          padding: 0;
          cursor: pointer;
          margin-bottom: 4px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      focusPerson: {type: Object},
      graph: {type: Object},
      preset: {type: String},
      _relation: {state: true},
      _saving: {state: true},
      _formValues: {state: true},
      _familyChoice: {state: true},
      _genders: {state: true},
    }
  }

  constructor() {
    super()
    this.open = false
    this.focusPerson = null
    this.graph = null
    this.preset = ''
    this._relation = ''
    this._saving = false
    this._formValues = null
    this._familyChoice = {label: '', options: []}
  }

  willUpdate(changed) {
    if (changed.has('open') && this.open) {
      this._relation = this.preset || ''
      this._saving = false
    }
    if (
      changed.has('_relation') ||
      changed.has('open') ||
      changed.has('focusPerson')
    ) {
      // new objects on every render would reset what the user typed or chose
      this._formValues = this._initialValues()
      this._familyChoice = this._familyOptions()
      this._genders = this._genderChoice()
    }
  }

  get _focusName() {
    return (
      personCard(this.focusPerson).givenName ||
      personCard(this.focusPerson).name
    )
  }

  _partners() {
    const focus = this.focusPerson?.handle
    return (this.focusPerson?.extended?.families ?? [])
      .filter(f => f.father_handle === focus || f.mother_handle === focus)
      .map(f => {
        const partner =
          f.father_handle === focus ? f.mother_handle : f.father_handle
        return {
          familyHandle: f.handle,
          name: partner
            ? personCard(this.graph?.person(partner)).name || this._('Unknown')
            : this._('Unknown'),
        }
      })
  }

  // Which family the new person goes into, if there is a choice: for a
  // child, the marriage; for a partner, whether they are the other parent
  // of children the person already has without a partner
  _familyOptions() {
    const focus = this.focusPerson?.handle
    if (this._relation === RELATION.CHILD) {
      const partners = this._partners()
      const options = partners.map(p => ({
        value: p.familyHandle,
        label: p.name,
      }))
      return {
        label: this._('With whom?'),
        options:
          options.length > 1
            ? [...options, {value: '', label: this._('someone else')}]
            : options,
      }
    }
    if (this._relation === RELATION.PARTNER) {
      const alone = (this.focusPerson?.extended?.families ?? []).filter(
        f =>
          (f.father_handle === focus) !== (f.mother_handle === focus) &&
          !(f.father_handle && f.mother_handle) &&
          f.child_ref_list?.length
      )
      const childNames = f =>
        f.child_ref_list
          .map(c => personCard(this.graph?.person(c.ref)).givenName)
          .filter(Boolean)
          .join(', ')
      return {
        label: this._('Is this also the other parent of the children?'),
        options: alone.length
          ? [
              ...alone.map(f => ({
                value: f.handle,
                label: this._('Yes, of %s', childNames(f)),
              })),
              {value: '', label: this._('No')},
            ]
          : [],
      }
    }
    return {label: '', options: []}
  }

  _genderChoice() {
    const female = {
      [RELATION.PARENT]: this._('Mother'),
      [RELATION.CHILD]: this._('Daughter'),
      [RELATION.SIBLING]: this._('Sister'),
      [RELATION.PARTNER]: this._('Woman'),
    }[this._relation]
    const male = {
      [RELATION.PARENT]: this._('Father'),
      [RELATION.CHILD]: this._('Son'),
      [RELATION.SIBLING]: this._('Brother'),
      [RELATION.PARTNER]: this._('Man'),
    }[this._relation]
    const choices = [
      {gender: GENDER.FEMALE, label: female},
      {gender: GENDER.MALE, label: male},
    ]
    // the first choice is preselected: a woman's partner is more often a man
    return this._relation === RELATION.PARTNER &&
      this.focusPerson?.gender === GENDER.FEMALE
      ? choices.reverse()
      : choices
  }

  _initialValues() {
    const surname = this.focusPerson?.profile?.name_surname ?? ''
    const keepSurname = [RELATION.CHILD, RELATION.SIBLING].includes(
      this._relation
    )
    return {...emptyValues(), surname: keepSurname ? surname : ''}
  }

  async _save(e) {
    const {values} = e.detail
    this._saving = true
    // a taken parent slot or a vanished family must stop us before anyone
    // is created
    const fresh = await fetchFocus(this.appState, this.focusPerson.handle)
    if ('error' in fresh) return this._fail(fresh.error)
    const problem = checkRelative(fresh.person, {
      relation: this._relation,
      gender: values.gender,
      familyHandle: values.familyHandle ?? '',
    })
    if (problem) return this._fail(this._(problem))
    const places = await ensurePlaces(this.appState, values)
    if ('error' in places) return this._fail(places.error)
    const objects = buildNewPerson({...places.values, gender: values.gender})
    const created = await this.appState.apiPost('/api/objects/', objects, {
      dbChanged: false,
    })
    if ('error' in created) return this._fail(created.error, places.transaction)
    await this._link(objects[0].handle, values, [
      ...places.transaction,
      ...(created.data ?? []),
    ])
    return undefined
  }

  async _linkExisting(e) {
    this._saving = true
    await this._link(
      e.detail.handle,
      {
        gender: e.detail.gender ?? GENDER.UNKNOWN,
        familyHandle: e.detail.familyHandle ?? '',
      },
      []
    )
  }

  async _link(handle, values, transaction) {
    const res = await linkRelative(this.appState, {
      relation: this._relation,
      focusHandle: this.focusPerson.handle,
      handle,
      gender: values.gender,
      familyHandle: values.familyHandle ?? '',
    })
    if ('error' in res) return this._fail(this._(res.error), transaction)
    fireUndo(
      this,
      this._('Person added'),
      [...transaction, ...res.transaction],
      `person/${this.focusPerson.gramps_id}`
    )
    this._saving = false
    fireEvent(this, 'family-dialog:close')
    return undefined
  }

  // Whatever was already saved stays; it is offered for undo with the error
  _fail(message, transaction = []) {
    this._saving = false
    if (transaction.length) {
      fireEvent(this, 'db:changed')
      fireUndo(
        this,
        message,
        transaction,
        `person/${this.focusPerson.gramps_id}`
      )
      return
    }
    fireEvent(this, 'grampsjs:error', {message})
  }

  _renderChoices() {
    const parentOk = canAddParent(this.focusPerson ?? {})
    const choice = (relation, label, hint, disabled = false) => html`<button
      class="choice"
      ?disabled="${disabled}"
      @click="${() => {
        this._relation = relation
      }}"
    >
      ${label}<small>${hint}</small>
    </button>`
    return html`<div class="choices">
      ${choice(
        RELATION.PARENT,
        this._('Mother or father'),
        parentOk ? '' : this._('Both are already known'),
        !parentOk
      )}
      ${choice(
        RELATION.PARTNER,
        this._('Partner'),
        this._('Marriage or partnership')
      )}
      ${choice(RELATION.CHILD, this._('Child'), this._('Son or daughter'))}
      ${choice(
        RELATION.SIBLING,
        this._('Sibling'),
        this._('Brother or sister')
      )}
    </div>`
  }

  render() {
    const heading = this._relation
      ? this._('Add person')
      : this._('Whom would you like to add?')
    return html`<grampsjs-family-dialog
      .appState="${this.appState}"
      .open="${this.open}"
      .heading="${heading}"
    >
      ${this._relation
        ? html`${this.preset
              ? ''
              : html`<button
                  class="back"
                  @click="${() => {
                    this._relation = ''
                  }}"
                >
                  ${this._('Back')}
                </button>`}
            <grampsjs-family-person-form
              .appState="${this.appState}"
              mode="add"
              .values="${this._formValues}"
              .familyOptions="${this._familyChoice.options}"
              .familyLabel="${this._familyChoice.label}"
              .genderChoice="${this._genders}"
              .excludeHandle="${this.focusPerson?.handle ?? ''}"
              ?saving="${this._saving}"
              @family-form:submit="${this._save}"
              @family-form:link="${this._linkExisting}"
            ></grampsjs-family-person-form>`
        : this._renderChoices()}
    </grampsjs-family-dialog>`
  }
}

window.customElements.define(
  'grampsjs-family-add-person',
  GrampsjsFamilyAddPerson
)
