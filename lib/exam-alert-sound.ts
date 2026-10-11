const ALERT_SOUNDS = [
  '/sounds/egyptian-english-uh-oh.wav',
  '/sounds/egyptian-english-oh-no.wav',
  '/sounds/egyptian-english-alalalala.wav',
  '/sounds/egyptian-english-come-back.wav',
  '/sounds/egyptian-english-where-going.wav',
  '/sounds/borat-very-nice.wav',
] as const

// Choose independently, with equal probability, for each audible proctor alert.
export function randomExamAlertSound() {
  return ALERT_SOUNDS[Math.floor(Math.random() * ALERT_SOUNDS.length)]
}
