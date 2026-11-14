# Servants Prep staff videos

The staff library is `/dashboard/guides/servants-prep`, reached from Guides and
contextual Watch guide links on SP workflow pages. It contains ten current
MP4s, posters, English WebVTT captions and written steps. Players do not preload
video, and starting one pauses other guides.

## Audience and delivery

Only active SUPER_ADMIN, PRIEST and SERVANTS_PREP_SERVANT role tags qualify.
Every page, poster, caption and video request rechecks the account and current
database grants. Missing/disabled accounts, changed authentication versions,
required password changes and revoked grants are denied. Sunday School-only
servants, students, parents and mentors without one of these grants are denied.
The navigation uses the same protected availability check, keyed by account.

Media lives in `private/sp-guides`, never `public`. The authorized media route
supports GET/HEAD and single byte ranges, with private/no-store responses and
an explicit asset/guide allowlist. Next output tracing includes these private
files in the media function bundle. Do not replace this with public Blob links.
The GitHub repository is public, so all 30 bundled files are encrypted with
AES-256-GCM before committing. The route authenticates each entire asset before
returning any plaintext range. Nonces are random and the original filename is
bound as authenticated data, preventing asset substitution. Only ciphertext is
traced into the deployment. No schema or production database update is required.

Deployment settings are managed by the deployment owner; Joshua does not have
Vercel access. Put setup requirements in the PR for that owner, rather than
asking Joshua to sign in. Do not post the key in this public repository or PR.

The deployment owner must set `SP_GUIDE_MEDIA_KEY` to the same private base64-encoded 32-byte key in
Vercel Production and Preview before merging/deploying this change. Never commit
or print the value. Local development uses ignored `.env`. The key is independent
of login secrets; changing it requires re-encrypting all media with
`bun scripts/guides/encrypt-sp-media.ts /absolute/path/to/exports`.
Keep unencrypted recordings/source archives outside this public repository.

## Series and recorded examples

| Guide | Fictional workflow shown |
| --- | --- |
| Weekly attendance | Open lesson, mark attendance and finish with saved confirmation |
| Student progress | Open profile, review exam results and attendance history |
| Exam and makeup scores | Enter an original score, save, locate separate makeup controls |
| Registrations | Review application and supporting evidence, approve, confirm status |
| Mentors | Inspect student details, assign an account, confirm saved mentor |
| Lesson calendar | Create a dated lesson and confirm its scheduled row/status controls |
| Live exam setup | Edit a complete answer key and save setup before opening |
| Exam monitoring | Inspect a paused attempt, unlock, close and release results |
| Async rotations | Review form controls, enter correction notes and return a form |
| Confession follow-up | Filter outstanding periods, open student history and period controls |

These are short introductions; written steps also explain alternate branches
such as approval, paper makeups and Year Two mentor forms. The recordings do
not simulate a successful external file upload or an unperformed approval.

## Media production

The recordings use application commit
`379e67638680be463de489229abf2fd219ea81ed` and a fresh isolated local PostgreSQL
database populated only with fictional fixtures. No production database was
copied, and no real account, pastoral record or student contact was filmed.
Recording ran in production mode so there is no development badge.

Captures are 3200 × 1400 from a 1600 × 700 logical viewport. Remotion renders
1920 × 1080, 60 fps H.264 CRF16 with AAC audio. The shared Mac-window/pencil
template animates captions, cursor travel, typing and dialog transitions while
keeping framing steady. Narration is AI-generated Kokoro `af_heart` at 1.02
speed, matching the existing guide series; it is not a human recording.

Editable media sources are delivered separately in `sp-guides-source.zip`,
with screenshots, narration, fonts/licenses, storyboards, timelines, render
script and provenance. Dependencies, model weights and temporary demo credentials
are excluded. Keep only one current MP4/poster/caption set per guide in the app.

Validation records are in `docs/sp-guides-media-validation.json` and
`docs/sp-guides-browser-validation.json`. Media validation checks complete
decode, dimensions, frame count, duration, AAC/H.264, non-clipping audio and
fast-start layout. Browser validation covers the real protected routes and
allowed/excluded account types. Keep this documentation current when replacing
an export.

## Draft release copy

Add to the next actual deployment's What's New entry after its date is confirmed:
“Servants Prep staff now have ten short video guides with captions and written
steps for attendance, student progress, exams, registrations, mentors, lesson
planning, async rotations and confession follow-up.”
