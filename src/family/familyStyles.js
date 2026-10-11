// src/family/familyStyles.js
import {css} from 'lit'

// Colour and font tokens. Defined once on <grampsjs-family-app> and
// inherited by the components inside it; [dark] mirrors data-theme on <html>.
export const familyTokens = css`
  :host {
    --fm-paper: #f7f8f5;
    --fm-canvas: #f4f6f2;
    --fm-dot: #cdd6ce;
    --fm-ink: #1e2b24;
    --fm-moss: #3e6a50;
    --fm-muted: #5f6f65;
    --fm-line: #a9baae;
    --fm-leaf: #e3ece5;
    --fm-border: #d6dfd8;
    --fm-card: #ffffff;
    --fm-add: #a8661a;
    --fm-add-tint: #f6ead9;
    --fm-focus-ring: #2f6fdb;
    --fm-focus-bg: #1e2b24;
    --fm-focus-fg: #f7f8f5;
    --fm-focus-sub: #cfe3d5;
    --fm-focus-face-bg: #2f4a3b;
    --fm-focus-face-fg: #cfe3d5;
    --fm-font-ui: 'Atkinson Hyperlegible', system-ui, sans-serif;
    --fm-font-name: 'Literata', Georgia, serif;
  }

  :host([dark]) {
    --fm-paper: #151b18;
    --fm-canvas: #121714;
    --fm-dot: #2a332e;
    --fm-ink: #e6ede8;
    --fm-moss: #9cc7aa;
    --fm-muted: #a6b4ab;
    --fm-line: #4d5d53;
    --fm-leaf: #24302a;
    --fm-border: #33403a;
    --fm-card: #1c2420;
    --fm-add: #e0a35a;
    --fm-add-tint: #3a2c1c;
    --fm-focus-ring: #7aa7ff;
    --fm-focus-bg: #cfe3d5;
    --fm-focus-fg: #121714;
    --fm-focus-sub: #2f4a3b;
    --fm-focus-face-bg: #a9c9b4;
    --fm-focus-face-fg: #1e2b24;
  }
`

export const familyStyles = css`
  :host {
    font-family: var(--fm-font-ui);
    font-size: 17px;
    line-height: 1.5;
    color: var(--fm-ink);
  }

  button {
    font: inherit;
    color: inherit;
  }

  :focus-visible {
    outline: 3px solid var(--fm-focus-ring);
    outline-offset: 2px;
  }

  .float {
    background: var(--fm-card);
    box-shadow: 0 6px 18px -8px rgba(20, 40, 30, 0.4);
    border: none;
  }

  .pill {
    min-height: 44px;
    border-radius: 999px;
    padding: 0 16px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }
`
