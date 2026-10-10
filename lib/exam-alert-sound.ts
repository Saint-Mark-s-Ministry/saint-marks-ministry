// Choose independently for each audible proctor alert.
export function randomExamAlertSound() {
  return Math.random() < 0.5 ? '/sounds/uh-oh.wav' : '/sounds/oh-no-natural.wav'
}
