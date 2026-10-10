const ALERT_SOUNDS = [
  '/sounds/egyptian-uh-oh.wav',
  '/sounds/egyptian-oh-no.wav',
  '/sounds/egyptian-alalalala.wav',
] as const

// Choose independently, with equal probability, for each audible proctor alert.
export function randomExamAlertSound() {
  return ALERT_SOUNDS[Math.floor(Math.random() * ALERT_SOUNDS.length)]
}
