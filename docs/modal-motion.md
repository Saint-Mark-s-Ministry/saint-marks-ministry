# Modal motion

Use `Dialog` / `DialogContent` or `AlertDialog` from `components/ui/` for every
modal. Custom layouts use the same `Dialog` root with `DialogSurface`. Do not
import a Radix root directly or build fixed-position modal overlays by hand.
These shared components preserve contents and delay their owner's close
callback until the exit animation finishes, including when the owner would
conditionally unmount the whole dialog. Escape, the backdrop, Close and
confirmation dismissal all use this lifecycle.

`--modal-motion-duration` in `app/globals.css` controls the exit duration.
`useModalExit` keeps the owner mounted for that duration plus one final-frame
allowance; reduced-motion users close immediately. Reopening cancels a pending
close, and unmounting cancels pending callbacks. Existing resize motion remains
in `DialogSurface` / `useAnimatedSize`.

For a custom action that removes a modal or replaces it with another (such as
Use photo or View organization), call `useModalExit(onClose)` in that component,
pass `open={!exit.closing}` to `Dialog`, and use `exit.close(action)` for the
button. Keep the root's `onOpenChange` wired to the owner's normal close callback;
it already defers Escape and backdrop dismissal. Retain source data and object
URLs until the deferred action runs. Do not add individual timeout values.

For immediate security-driven removals (revoked access, sign-out, deleted
records), unmount immediately; never retain confidential content for animation.

Programmatic `open={false}` transitions on a continuously mounted root use
Radix presence and the same CSS closing animation. Record details, command
search, mobile navigation, enlarged photos, notifications, file previews,
camera capture and cropping use the shared modal primitives too.
