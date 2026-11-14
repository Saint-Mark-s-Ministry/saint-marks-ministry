# Portal guides

`/dashboard/guides` is shared reference material for signed-in accounts. The
Sunday School workflow links appear for accounts with the corresponding
ministry standing; each destination continues to enforce its own permissions.

The guide library is defined in `lib/guides.ts` and rendered by
`components/guides.tsx`. Preserve existing IDs when updating a guide so links
from pages and feedback replies keep working.

Each guide uses one current MP4, a JPG poster, and English WebVTT captions in
`public/guides/`. The videos also include on-screen captions. Players reserve
their aspect ratio, do not preload video data, and pause other guides when
playback starts. Written steps and phone navigation notes are available beside
each desktop video.

Current topics are lesson materials, QR attendance, weekly attendance, class
follow-up, learning names, Elementary homework, contact-update QR, memorization,
and lesson/birthday calendar subscriptions. Attendance and Care have Watch guide links; the QR dialog's
Servant controls also links directly to its QR guide.

## Updating media

The editable Remotion projects are delivered separately with the media source
archives. All nine compositions share one 60 fps template and
use real application screenshots with fictional data. Narration is locally
generated Kokoro `af_heart` at 1.02× native speed; it is not a human recording.
Use clear verbs such as “take attendance” in narration. Keep screen framing
steady inside one Mac-style window. Capture every scene at the same 1600 × 700
logical viewport and 3200 × 1400 image resolution. Check that the complete UI
has loaded and that development badges are absent. Do not upscale smaller
captures or introduce empty side bars.

Use animated typing, continuous cursor travel, independently sprung dialog
panels, and drawn pencil callouts rather than a sequence of static slides.
Keep the paper texture and sketched accents subtle so the real UI stays clear.
Render PNG intermediate frames and H.264 at CRF 16, 1080p, 60 fps. Avoid recurring
camera zooms and extra brand headers. Bump `GUIDE_MEDIA_VERSION` in
`lib/guides.ts` when replacing media so viewers load the latest video and poster.

Before replacing an asset, review the actual workflow on the latest app,
render the video, check the captions and narration, and verify playback on
both desktop and phone layouts. Retain only the current export for each guide;
keep render dependencies, models, caches, and superseded exports out of the
application repository. Never capture real children's records or contact
information for public guide assets.

Learn names, Contact update QR, Homework, Memorization, and both calendar
subscription dialogs link directly to their guide. New guides use fictional
illustrated portraits rather than photographs of real children. Calendar demo
feeds and contact links are disposable and never grant production access.

## Account passkeys

The shared library also includes `account-passkeys` for every signed-in account.
My account links to it from Passkeys, including the unavailable state. This guide
uses the current desktop UI and a clearly labeled, animated illustration for the
device/password-manager confirmation because those prompts vary. It covers
enrollment after account creation, sign-in, removal, fallback, and the recent
sign-in requirement. It grants no additional account or ministry permissions.
