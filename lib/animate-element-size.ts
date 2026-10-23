/** Animate a naturally sized box without adding wrappers or pinning its layout.
 * Observe layout sizes (not transformed bounds) so a modal's opening zoom does
 * not interfere. Web Animations leave authored dimensions/viewport caps intact.
 */
export function observeAnimatedSize(element: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof element.animate !== 'function') return () => {}

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const duration = 220
  const size = () => ({ width: element.offsetWidth, height: element.offsetHeight })
  const same = (a: ReturnType<typeof size>, b: ReturnType<typeof size>) =>
    Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1
  let target = size()
  let animation: Animation | null = null
  let animationDuration = duration
  let disposed = false

  function stop() {
    const previous = animation
    animation = null
    previous?.cancel()
  }

  function update() {
    if (disposed) return
    const from = animation ? size() : target
    const previousTarget = target
    const remaining = animation ? Math.max(1, animationDuration - Number(animation.currentTime ?? 0)) : duration
    // Cancel before measuring the new intrinsic dimensions; the previous
    // animation would otherwise mask content changes until it finished.
    stop()
    target = size()
    if (motion.matches || element.dataset.state === 'closed' ||
        !from.width || !from.height || same(from, target)) return

    animationDuration = same(previousTarget, target) ? remaining : duration
    const next = element.animate([
      { width: `${from.width}px`, height: `${from.height}px`, overflow: 'clip' },
      { width: `${target.width}px`, height: `${target.height}px`, overflow: 'clip' },
    ], {
      duration: animationDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    animation = next
    void next.finished.then(() => {
      if (animation === next) animation = null
    }, () => { /* Cancellation is normal during retargeting/closing. */ })
  }

  const resize = new ResizeObserver(() => {
    // Our own width/height frames also trigger ResizeObserver. Ignore them;
    // React/content mutations can still retarget an in-progress animation.
    if (!animation) update()
  })
  resize.observe(element)
  const mutations = new MutationObserver(() => {
    if (element.dataset.state === 'closed' || motion.matches) {
      stop()
      target = size()
    } else if (animation) {
      update()
    }
    // With no active animation, ResizeObserver handles the natural resize
    // before paint. Attribute changes alone do not start an animation.
  })
  mutations.observe(element, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'hidden', 'open', 'data-state'],
  })
  const contentLoaded = () => { if (animation) update() }
  const motionChanged = () => { if (motion.matches) { stop(); target = size() } }
  element.addEventListener('load', contentLoaded, true)
  window.addEventListener('resize', update)
  motion.addEventListener('change', motionChanged)

  return () => {
    disposed = true
    resize.disconnect()
    mutations.disconnect()
    element.removeEventListener('load', contentLoaded, true)
    window.removeEventListener('resize', update)
    motion.removeEventListener('change', motionChanged)
    stop()
  }
}
