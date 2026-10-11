// src/family/media.js
// Photo references of a person.
export function withMediaRef(mediaList, mediaHandle, asProfile) {
  const list = mediaList ?? []
  const existing = list.find(r => r.ref === mediaHandle)
  const ref = existing ?? {_class: 'MediaRef', ref: mediaHandle}
  const others = list.filter(r => r.ref !== mediaHandle)
  return asProfile ? [ref, ...others] : [...others, ref]
}
