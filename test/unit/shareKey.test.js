import {describe, it, expect} from 'vitest'
import {getShareKey, makeShareLink} from '../../src/api.js'

describe('share link', () => {
  it('round-trips the password through the URL fragment', () => {
    const link = makeShareLink('geh eim&1')
    window.history.replaceState(
      null,
      '',
      new URL(link).pathname + new URL(link).hash
    )
    expect(getShareKey()).toBe('geh eim&1')
    expect(window.location.hash).toBe('')
    // remembered after the hash is gone
    expect(getShareKey()).toBe('geh eim&1')
  })
})
