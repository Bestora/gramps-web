// src/family/uiMode.js
// Decides whether an account sees the simplified family UI or the full UI.
// This is a matter of presentation only; permissions come from the role.

export const UI_MODE_FAMILY = 'family'
export const UI_MODE_FULL = 'full'
export const ROLE_OWNER = 4
export const TREE_CONFIG_UI_MODES = 'frontend.uiModes'
export const TREE_CONFIG_USER_PERSONS = 'frontend.userPersons'

const OVERRIDE_KEY = 'grampsjs_ui_mode_override'
const isMode = mode => mode === UI_MODE_FAMILY || mode === UI_MODE_FULL

export function canSwitchUiMode(role) {
  return (role ?? -1) >= ROLE_OWNER
}

export function resolveUiMode({role, username, treeConfig = {}, override}) {
  if (role === undefined || role === null) {
    return UI_MODE_FULL
  }
  if (canSwitchUiMode(role) && isMode(override)) {
    return override
  }
  const configured = treeConfig?.[TREE_CONFIG_UI_MODES]?.[username]
  if (isMode(configured)) {
    return configured
  }
  return canSwitchUiMode(role) ? UI_MODE_FULL : UI_MODE_FAMILY
}

export function getUiModeOverride() {
  try {
    return localStorage.getItem(OVERRIDE_KEY)
  } catch (e) {
    return null
  }
}

export function setUiModeOverride(mode) {
  try {
    if (mode) {
      localStorage.setItem(OVERRIDE_KEY, mode)
    } else {
      localStorage.removeItem(OVERRIDE_KEY)
    }
  } catch (e) {
    // ignore
  }
}
