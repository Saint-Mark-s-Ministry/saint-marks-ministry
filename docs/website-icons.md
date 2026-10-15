# Website icons and 1Password

The reported 1Password Login item stores **https://www.stmarkministry.app**.

## Findings

The application already provides browser icons. Verification of the production
build running locally, without signing in, returned:

| URL | HTTP status | Content type | Image size |
| --- | --- | --- | --- |
| `/favicon.ico` | 200 | `image/x-icon` | 32 × 32 |
| `/sunday-school-favicon-32.png` | 200 | `image/png` | 32 × 32 |
| `/sunday-school-icon-512.png` | 200 | `image/png` | 512 × 512 |
| `/sunday-school-apple-touch-icon-v2.png` | 200 | `image/png` | 180 × 180 |

Both `/` and `/login` return public HTML. The built login HTML includes
`rel="icon"` links for the 32-, 192-, and 512-pixel PNGs, a `shortcut icon`
link, and an `apple-touch-icon` link. These are explicitly declared in
[`app/layout.tsx`](../app/layout.tsx). The image headers match their advertised
dimensions. No application-side icon delivery failure was reproduced.

**1Password uses a separate rich-icon catalog**, rather than directly using a
site's favicon. Its [current support documentation](https://support.1password.com/rich-icons-privacy/)
explains that rich icons come from 1Password's cache servers. A
[1Password staff answer about this exact situation](https://www.1password.community/1password-at-home-31/own-websites-icon-not-showing-in-app-as-icon-19681)
states that website icons must be added to its catalog and asks for a PNG of at
least 512 × 512 together with the website domain.

The likely explanation is a missing or stale rich-icon entry for this website,
assuming **Show app and website icons** is enabled in the user's 1Password app
or extension. Updating this site's favicon declarations cannot force a change
to 1Password's catalog. This is independent of passkey registration and login.

The live website and 1Password cache were not accessible through the research
tool during this investigation. Local checks establish the repository/build
behavior, not the current production response, the state of 1Password's catalog,
or the user's settings. A missing catalog entry remains an inference until
1Password confirms it. No favicon code change is proposed on that assumption.

## Resolution

1. Confirm the item's website is `https://www.stmarkministry.app` and that
   **Show app and website icons** is enabled. App and browser-extension settings
   are separate; see the [official instructions](https://support.1password.com/rich-icons-privacy/).
2. For an immediate per-item solution, edit the Login item, select its current
   icon, and choose a custom image. Use the existing
   [`public/sunday-school-icon-512.png`](../public/sunday-school-icon-512.png).
   1Password documents custom icons in
   [View and edit your items](https://support.1password.com/1password-com-items/).
3. For an automatic icon available to everyone, request a catalog addition or
   refresh from 1Password support. Include the exact saved hostname and attach
   that same 512 × 512 PNG. The corresponding production asset URL is
   `https://www.stmarkministry.app/sunday-school-icon-512.png`; verify it is
   publicly accessible when submitting the request.

Suggested support message (prepared only; not sent):

> Please add or refresh the rich icon for St. Mark Ministry Portal,
> https://www.stmarkministry.app. Login items using this website currently show
> a generic icon. Attached is our 512 × 512 PNG. Please confirm the catalog
> entry covers this hostname and advise when clients should receive the icon.

Changing the production domain later may also require updating the catalog
entry. Keep this separate from WebAuthn's RP ID configuration described in
[`passkeys.md`](passkeys.md).
