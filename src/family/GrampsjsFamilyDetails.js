// src/family/GrampsjsFamilyDetails.js
// Details of the selected person: side panel on wide screens, bottom sheet
// on narrow ones.
import {html, css, LitElement} from 'lit'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'

class GrampsjsFamilyDetails extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        :host {
          display: block;
          background: var(--fm-card);
          box-sizing: border-box;
        }
        .grip {
          display: none;
        }
        h2 {
          margin: 0;
          font-family: var(--fm-font-name);
          font-weight: 600;
          font-size: 26px;
          line-height: 1.15;
        }
        .years {
          color: var(--fm-muted);
          margin: 2px 0 16px;
        }
        dl {
          margin: 0;
        }
        dl div {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 8px;
          padding: 8px 0;
          border-top: 1px solid var(--fm-leaf);
          font-size: 15px;
        }
        dt {
          color: var(--fm-muted);
        }
        dd {
          margin: 0;
        }
        .kin {
          background: var(--fm-leaf);
          border-radius: 14px;
          padding: 10px 14px;
          margin-bottom: 14px;
        }
        .kin strong {
          display: block;
        }
        .kin small {
          color: var(--fm-muted);
        }
        .actions {
          display: grid;
          gap: 8px;
          margin-top: 16px;
        }
        .actions button {
          min-height: 46px;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          background: var(--fm-leaf);
          color: var(--fm-ink);
          cursor: pointer;
        }
        .actions .add {
          background: var(--fm-add);
          color: var(--fm-on-add);
        }
        @media (max-width: 991px) {
          :host(:not([expanded])) .kin {
            display: none;
          }
          .actions {
            grid-template-columns: 1fr 1fr;
          }
          .actions .add {
            grid-column: 1 / -1;
          }
          :host {
            border-radius: 22px 22px 0 0;
            box-shadow: 0 -10px 30px -12px rgba(20, 40, 30, 0.35);
            padding: 8px 18px 18px;
          }
          .grip {
            display: block;
            width: 100%;
            min-height: 24px;
            border: none;
            background: none;
            cursor: pointer;
          }
          .grip::before {
            content: '';
            display: block;
            width: 44px;
            height: 5px;
            border-radius: 3px;
            background: var(--fm-border);
            margin: 0 auto;
          }
          h2 {
            font-size: 22px;
          }
          :host(:not([expanded])) dl {
            display: none;
          }
          :host(:not([expanded])) .years {
            margin-bottom: 0;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      card: {type: Object},
      relatives: {type: Object},
      expanded: {type: Boolean, reflect: true},
      kinship: {type: Object},
      isMe: {type: Boolean},
      canAdd: {type: Boolean},
      canEdit: {type: Boolean},
      familyLink: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.card = null
    this.relatives = {parents: [], partners: [], children: 0}
    this.expanded = false
    this.kinship = null
    this.isMe = false
    this.canAdd = false
    this.canEdit = false
    this.familyLink = false
  }

  _action(action) {
    fireEvent(this, 'family:action', {action})
  }

  _line(label, value) {
    return value
      ? html`<div>
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>`
      : ''
  }

  _event(e) {
    return [e?.date, e?.place].filter(Boolean).join(', ')
  }

  render() {
    if (!this.card) return ''
    const {parents, partners, children, siblings = []} = this.relatives
    return html`
      <button
        class="grip"
        aria-label="${this.expanded ? this._('Less') : this._('More')}"
        @click="${() => {
          this.expanded = !this.expanded
        }}"
      ></button>
      <h2>${this.card.name}</h2>
      <div class="years">${this.card.years}</div>
      ${this.isMe
        ? html`<div class="kin"><strong>${this._('This is you')}</strong></div>`
        : this.kinship?.relation
        ? html`<div class="kin">
            <strong>${this.kinship.relation}</strong>
            ${this.kinship.ancestors.length
              ? html`<small
                  >${this._(
                    'Common ancestors: %s',
                    this.kinship.ancestors.join(', ')
                  )}</small
                >`
              : ''}
          </div>`
        : ''}
      <dl>
        ${this._line(this._('Born'), this._event(this.card.birth))}
        ${this._line(this._('Died'), this._event(this.card.death))}
        ${this._line(this._('Parents'), parents.join(', '))}
        ${this._line(this._('Partners'), partners.join(', '))}
        ${this._line(this._('Siblings'), siblings.join(', '))}
        ${this._line(this._('Children'), children ? `${children}` : '')}
      </dl>
      ${this.familyLink
        ? html`<div class="actions">
            <button @click="${() => fireEvent(this, 'family:show-family')}">
              ${this._('Show in the family')}
            </button>
          </div>`
        : ''}
      ${this.canAdd || this.canEdit
        ? html`<div class="actions">
            ${this.canAdd
              ? html`<button class="add" @click="${() => this._action('add')}">
                  ${this._('Add person')}
                </button>`
              : ''}
            ${this.canAdd
              ? html`<button @click="${() => this._action('photo')}">
                  ${this._('Upload photo')}
                </button>`
              : ''}
            ${this.canEdit
              ? html`<button @click="${() => this._action('edit')}">
                  ${this._('Edit details')}
                </button>`
              : ''}
          </div>`
        : ''}
    `
  }
}

window.customElements.define('grampsjs-family-details', GrampsjsFamilyDetails)
