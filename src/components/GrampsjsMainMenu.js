/*
The dropdown menu for adding objects in the top app bar
*/

import {html, css, LitElement} from 'lit'
import '@material/web/list/list'
import '@material/web/list/list-item'
import '@material/web/divider/divider'

import {
  mdiFamilyTree,
  mdiCreation,
  mdiDna,
  mdiHome,
  mdiImage,
  mdiRss,
  mdiFormatListBulleted,
  mdiMap,
  mdiHistory,
  mdiBookmark,
  mdiFormatListChecks,
  mdiDownload,
  mdiFileExportOutline,
  mdiSourceCommit,
  mdiBell,
  mdiBellBadge,
  mdiTimelineOutline,
} from '@mdi/js'
import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import './GrampsjsIcon.js'
import {isMenuHidden} from '../api.js'

const BASE_DIR = ''

// menu entries an admin can hide (Home always stays)
export const MENU_ITEMS = [
  ['blog', 'Blog'],
  ['tree', 'Family Tree'],
  ['timeline', 'Timeline'],
  ['map', 'Map'],
  ['dna', 'DNA'],
  ['lists', 'Lists'],
  ['media', 'Media'],
  ['recent', 'History'],
  ['bookmarks', '_Bookmarks'],
  ['tasks', 'Tasks'],
  ['reports', '_Reports'],
  ['export', 'Export'],
  ['notifications', 'Notifications'],
]

const selectedColor = 'var(--grampsjs-color-icon-selected)'
const defaultColor = 'var(--grampsjs-color-icon-default)'

class GrampsjsAppBar extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        md-list-item {
          --md-list-item-label-text-color: var(--grampsjs-color-drawer-text);
          --md-list-item-label-text-size: 1rem;
          --md-list-item-label-text-weight: 400;
          --md-list-item-one-line-container-height: 40px;
        }

        md-list-item[selected] {
          --md-list-item-label-text-color: var(--grampsjs-color-icon-selected);
          --md-list-item-label-text-weight: 500;
        }

        md-list-item[hidden] {
          display: none;
        }

        md-divider {
          --md-divider-thickness: 1px;
          --md-divider-color: rgba(0, 0, 0, 0.12);
          padding: 0 20px;
          margin: 4px 0;
        }

        .unread-badge {
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 9px;
          background: var(--md-sys-color-error, #b00020);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          line-height: 18px;
          text-align: center;
          box-sizing: border-box;
        }
      `,
    ]
  }

  static get properties() {
    return {
      editMode: {type: Boolean},
      editTitle: {type: String},
      editDialogContent: {type: String},
      saveButton: {type: Boolean},
      unreadCount: {type: Number},
    }
  }

  constructor() {
    super()
    this.editMode = false
    this.editTitle = ''
    this.editDialogContent = ''
    this.saveButton = false
    this.unreadCount = 0
    this._boundHandleNotifications = this._handleNotificationsChanged.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    const existing = this.appState?.getNotifications?.() ?? []
    this.unreadCount = existing.filter(n => n?.read === false).length
    window.addEventListener(
      'notifications:changed',
      this._boundHandleNotifications
    )
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener(
      'notifications:changed',
      this._boundHandleNotifications
    )
  }

  _handleNotificationsChanged(e) {
    this.unreadCount = e.detail.unreadCount
  }

  _hidden(key) {
    return isMenuHidden(this.appState, key)
  }

  _icon(path, isSelected) {
    return html`<grampsjs-icon
      slot="start"
      path="${path}"
      color="${isSelected ? selectedColor : defaultColor}"
    ></grampsjs-icon>`
  }

  render() {
    const p = this.appState.path.page
    const listsPages = [
      'people',
      'families',
      'events',
      'places',
      'citations',
      'sources',
      'repositories',
      'notes',
    ]
    return html` <md-list>
      <md-list-item
        type="link"
        href="${BASE_DIR + '/'}"
        ?selected="${p === 'home'}"
      >
        ${this._icon(mdiHome, p === 'home')} ${this._('Home')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/blog"
        ?hidden="${this._hidden('blog')}"
        ?selected="${p === 'blog'}"
      >
        ${this._icon(mdiRss, p === 'blog')} ${this._('Blog')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/tree"
        ?hidden="${this._hidden('tree')}"
        ?selected="${p === 'tree'}"
      >
        ${this._icon(mdiFamilyTree, p === 'tree')} ${this._('Family Tree')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/timeline"
        ?hidden="${this._hidden('timeline')}"
        ?selected="${p === 'timeline'}"
      >
        ${this._icon(mdiTimelineOutline, p === 'timeline')}
        ${this._('Timeline')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/map"
        ?hidden="${this._hidden('map')}"
        ?selected="${p === 'map'}"
      >
        ${this._icon(mdiMap, p === 'map')} ${this._('Map')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/dna-matches"
        ?hidden="${this._hidden('dna')}"
        ?selected="${['dna-matches', 'dna-chromosome', 'ydna'].includes(p)}"
      >
        ${this._icon(
          mdiDna,
          ['dna-matches', 'dna-chromosome', 'ydna'].includes(p)
        )}
        ${this._('DNA')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/people"
        ?hidden="${this._hidden('lists')}"
        ?selected="${listsPages.includes(p)}"
      >
        ${this._icon(mdiFormatListBulleted, listsPages.includes(p))}
        ${this._('Lists')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/medialist"
        ?hidden="${this._hidden('media')}"
        ?selected="${p === 'medialist'}"
      >
        ${this._icon(mdiImage, p === 'medialist')} ${this._('Media')}
      </md-list-item>
      ${this.canUseChat
        ? html`
            <md-list-item
              type="link"
              href="${BASE_DIR}/chat"
              ?selected="${p === 'chat'}"
            >
              ${this._icon(mdiCreation, p === 'chat')} ${this._('Assistant')}
            </md-list-item>
          `
        : ''}
      <md-divider inset></md-divider>
      <md-list-item
        type="link"
        href="${BASE_DIR}/recent"
        ?hidden="${this._hidden('recent')}"
        ?selected="${p === 'recent'}"
      >
        ${this._icon(mdiHistory, p === 'recent')} ${this._('History')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/bookmarks"
        ?hidden="${this._hidden('bookmarks')}"
        ?selected="${p === 'bookmarks'}"
      >
        ${this._icon(mdiBookmark, p === 'bookmarks')} ${this._('_Bookmarks')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/tasks"
        ?hidden="${this._hidden('tasks')}"
        ?selected="${p === 'tasks'}"
      >
        ${this._icon(mdiFormatListChecks, p === 'tasks')} ${this._('Tasks')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/reports"
        ?hidden="${this._hidden('reports')}"
        ?selected="${p === 'reports'}"
      >
        ${this._icon(mdiFileExportOutline, p === 'reports')}
        ${this._('_Reports').replace('_', '')}
      </md-list-item>
      <md-list-item
        type="link"
        href="${BASE_DIR}/export"
        ?hidden="${this._hidden('export')}"
        ?selected="${p === 'export'}"
      >
        ${this._icon(mdiDownload, p === 'export')} ${this._('Export')}
      </md-list-item>
      <md-divider inset></md-divider>
      ${this.appState.permissions.canViewPrivate
        ? html`
            <md-list-item
              type="link"
              href="${BASE_DIR}/revisions"
              ?selected="${p === 'revisions'}"
            >
              ${this._icon(mdiSourceCommit, p === 'revisions')}
              ${this._('Revisions')}
            </md-list-item>
          `
        : ''}
      <md-list-item
        type="link"
        href="${BASE_DIR}/notifications"
        ?hidden="${this._hidden('notifications')}"
        ?selected="${p === 'notifications'}"
      >
        ${this._icon(
          this.unreadCount > 0 ? mdiBellBadge : mdiBell,
          p === 'notifications'
        )}
        ${this._('Notifications')}
        ${this.unreadCount > 0
          ? html`<span class="unread-badge" slot="end"
              >${this.unreadCount}</span
            >`
          : ''}
      </md-list-item>
    </md-list>`
  }
}

window.customElements.define('grampsjs-main-menu', GrampsjsAppBar)
