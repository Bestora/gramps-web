// test/unit/familyUiMode.test.js
import {describe, it, expect, beforeEach} from 'vitest'
import {
  resolveUiMode,
  canSwitchUiMode,
  getUiModeOverride,
  setUiModeOverride,
  UI_MODE_FAMILY,
  UI_MODE_FULL,
  TREE_CONFIG_UI_MODES,
} from '../../src/family/uiMode.js'

const config = modes => ({[TREE_CONFIG_UI_MODES]: modes})

describe('resolveUiMode', () => {
  it('defaults owners and admins to the full UI', () => {
    expect(resolveUiMode({role: 4, username: 'o'})).toBe(UI_MODE_FULL)
    expect(resolveUiMode({role: 5, username: 'a'})).toBe(UI_MODE_FULL)
  })

  it('defaults everyone else to the family UI', () => {
    expect(resolveUiMode({role: 3, username: 'e'})).toBe(UI_MODE_FAMILY)
    expect(resolveUiMode({role: 0, username: 'g'})).toBe(UI_MODE_FAMILY)
  })

  it('falls back to the full UI when the role is unknown', () => {
    expect(resolveUiMode({role: undefined, username: ''})).toBe(UI_MODE_FULL)
  })

  it('uses the per-account setting from the tree config', () => {
    const treeConfig = config({e: 'full', o: 'family'})
    expect(resolveUiMode({role: 3, username: 'e', treeConfig})).toBe(
      UI_MODE_FULL
    )
    expect(resolveUiMode({role: 4, username: 'o', treeConfig})).toBe(
      UI_MODE_FAMILY
    )
  })

  it('ignores invalid tree config values', () => {
    const treeConfig = config({e: 'fancy'})
    expect(resolveUiMode({role: 3, username: 'e', treeConfig})).toBe(
      UI_MODE_FAMILY
    )
  })

  it('lets owners override the view locally, but not others', () => {
    expect(resolveUiMode({role: 4, username: 'o', override: 'family'})).toBe(
      UI_MODE_FAMILY
    )
    expect(resolveUiMode({role: 3, username: 'e', override: 'full'})).toBe(
      UI_MODE_FAMILY
    )
  })
})

describe('canSwitchUiMode', () => {
  it('is true from the owner role up', () => {
    expect(canSwitchUiMode(4)).toBe(true)
    expect(canSwitchUiMode(3)).toBe(false)
    expect(canSwitchUiMode(undefined)).toBe(false)
  })
})

describe('UI mode override', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through localStorage', () => {
    expect(getUiModeOverride()).toBe(null)
    setUiModeOverride('family')
    expect(getUiModeOverride()).toBe('family')
    setUiModeOverride(null)
    expect(getUiModeOverride()).toBe(null)
  })
})
