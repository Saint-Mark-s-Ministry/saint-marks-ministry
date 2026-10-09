'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getModifier = () => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘' : 'Ctrl+')

/** Render no platform hint on the server, then show the local keyboard modifier. */
export function useShortcutModifier() {
  return useSyncExternalStore(subscribe, getModifier, () => null)
}
