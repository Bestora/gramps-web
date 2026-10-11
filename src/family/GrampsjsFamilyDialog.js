// src/family/GrampsjsFamilyDialog.js
// Modal dialog of the family UI on top of the native <dialog> element:
// centred on wide screens, a bottom sheet on narrow ones.
import {html, css, LitElement} from 'lit'
import {mdiClose} from '@mdi/js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {familyStyles} from './familyStyles.js'
import {fireEvent} from '../util.js'
import '../components/GrampsjsIcon.js'

class GrampsjsFamilyDialog extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      familyStyles,
      css`
        dialog {
          border: none;
          padding: 0;
          border-radius: 22px;
          width: min(520px, calc(100vw - 32px));
          max-height: calc(100dvh - 48px);
          background: var(--fm-card);
          color: var(--fm-ink);
          box-shadow: 0 24px 60px -20px rgba(20, 40, 30, 0.5);
        }
        dialog::backdrop {
          background: rgba(20, 32, 26, 0.35);
        }
        header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px 12px 4px 22px;
        }
        h2 {
          flex: 1;
          margin: 0;
          font-size: 20px;
        }
        .close {
          width: 44px;
          height: 44px;
          border: none;
          background: none;
          border-radius: 50%;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .body {
          padding: 8px 22px 22px;
          overflow-y: auto;
        }
        @media (max-width: 991px) {
          dialog {
            width: 100vw;
            max-width: 100vw;
            margin: auto 0 0;
            border-radius: 22px 22px 0 0;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      open: {type: Boolean},
      heading: {type: String},
    }
  }

  constructor() {
    super()
    this.open = false
    this.heading = ''
  }

  updated(changed) {
    if (!changed.has('open')) return
    const dialog = this.renderRoot.querySelector('dialog')
    if (this.open && !dialog.open) dialog.showModal()
    if (!this.open && dialog.open) dialog.close()
  }

  _close() {
    fireEvent(this, 'family-dialog:close')
  }

  render() {
    return html`<dialog
      aria-label="${this.heading}"
      @cancel="${e => {
        e.preventDefault()
        this._close()
      }}"
    >
      <header>
        <h2>${this.heading}</h2>
        <button
          class="close"
          aria-label="${this._('Close')}"
          @click="${this._close}"
        >
          <grampsjs-icon
            path="${mdiClose}"
            color="currentColor"
          ></grampsjs-icon>
        </button>
      </header>
      <div class="body"><slot></slot></div>
    </dialog>`
  }
}

window.customElements.define('grampsjs-family-dialog', GrampsjsFamilyDialog)
