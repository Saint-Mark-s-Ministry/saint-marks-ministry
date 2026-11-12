# Password manager icons

## Website checks

On November 12, 2026, the production portal served each of these public assets
with HTTP 200 and the correct image content type. Their bytes match the approved
assets in this repository:

- `/favicon.ico`
- `/sunday-school-favicon-32.png`
- `/sunday-school-icon-512.png`
- `/sunday-school-apple-touch-icon-v2.png`

The public page advertises the PNG browser and Apple touch icons in its HTML.
The apex `stmarkministry.app` redirects to `www.stmarkministry.app`. There is no
evidence of a broken website icon behind the reported 1Password symptom.

## 1Password

1Password supplies automatic login icons from its own rich-icon catalog rather
than directly from the website. Its support team can request a new catalog
entry. A missing catalog entry is the likely explanation when this portal alone
has a generic icon; this has not been confirmed inside the user's vault.

Before requesting an entry, confirm the saved item has the website address and
that **Show app and website icons** is enabled in 1Password. A custom item icon
is an immediate option for an individual user.

For a catalog request, provide both portal hostnames and the existing square PNG:

- `stmarkministry.app`
- `www.stmarkministry.app`
- [Approved 512 × 512 logo](https://www.stmarkministry.app/sunday-school-icon-512.png)

1Password's staff directs website owners to `support+forum@1password.com` with
the domain and a high-quality PNG. This is an external catalog update; deploying
the portal cannot guarantee when it appears in 1Password. No support request has
been sent as part of this investigation.

Sources:

- [Rich icons and privacy](https://support.1password.com/rich-icons-privacy/)
- [1Password staff explanation and submission instructions](https://www.1password.community/1password-at-home-31/own-websites-icon-not-showing-in-app-as-icon-19681)
- [Website address, icon setting, and PNG size guidance](https://www.1password.community/1password-at-home-31/bulk-update-icons-on-my-passwords-21076)
