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

Current topics are lesson materials, QR attendance, weekly attendance, and
class follow-up. Attendance and Care have Watch guide links; the QR dialog's
Servant controls also links directly to its QR guide.

## Updating media

The editable Remotion projects are delivered separately with the media source
archives. All four compositions share one 60 fps template and
use real application screenshots with fictional data. Narration is locally
generated Kokoro `af_heart` at 1.02× native speed; it is not a human recording.
Use clear verbs such as “take attendance” in narration. Keep screen framing
steady. Use damped spring transitions for step text, eased cursor movement,
brief click ripples, and short crossfades between UI states. Do not reintroduce
per-step zooms or an extra logo/header over the captured application.

Before replacing an asset, review the actual workflow on the latest app,
render the video, check the captions and narration, and verify playback on
both desktop and phone layouts. Retain only the current export for each guide;
keep render dependencies, models, caches, and superseded exports out of the
application repository. Never capture real children's records or contact
information for public guide assets.
