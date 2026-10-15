# Saint Mark's Ministry — App Store website plan

Planning draft, October 14, 2026. The app name is provisional. The user has
confirmed that the app will not have subscriptions and that user support should
use developer@copticchurch.net.

## Website implementation

The accompanying PR adds `/app` and `/support`, links them from the public footer,
and expands the existing privacy policy and terms to cover the associated mobile
app. The overview uses the existing church logo rather than screenshots of
unverified mobile features. App Store download links remain a follow-up once the
listing is available.

Both pages use the portal's typography and theme colors. Appearance follows the
device setting by default; the public appearance menu supports explicit Light,
Dark, and Use device setting choices. Scroll reveals, FAQ expansion, and hover
effects respect reduced-motion settings, and all content remains usable without
animation support.

Release-build privacy disclosures and in-app account deletion remain submission
checks. The public deletion FAQ describes the current support route and does not
claim to implement Apple's required in-app deletion flow.

## Purpose and audience

Saint Mark's Ministry supports the Coptic Orthodox Church of Saint Mark in
Jersey City. It brings together two ministry workspaces:

- **Sunday School:** class rosters, child and servant attendance, lesson
  planning, parent registration, guardian relationships, and ministry follow-up.
- **Servants Prep:** the two-year preparation program, including curriculum,
  attendance, exams, mentors, student progress, and serving requirements.

The public website should explain this purpose to families, students, servants,
mentors, clergy, and App Review, and give users clear support and privacy links.
Describe access as depending on an approved account and ministry assignment;
do not imply that downloading the app grants access to church records.

The repository README and AGENTS.md establish these workflows. Recent mobile
project context confirms that the iOS app uses www.stmarkministry.app. Confirm
the features included in the actual release build before choosing screenshots
or publishing feature claims.

## What already exists

| Item | Source evidence | Planning implication |
|---|---|---|
| Existing domain | README.md links to https://www.stmarkministry.app | Reuse the existing site and deployment. |
| Public privacy policy | app/privacy/page.tsx | Update and reuse /privacy. |
| Public terms | app/terms/page.tsx | Reuse /terms; align naming and mobile scope. |
| Root entry point | app/page.tsx redirects to /login or /dashboard | Add /app for the overview, preserving the current entry flow. |
| Parent account creation | app/signup/parent/page.tsx and app/api/auth/signup/parent/route.ts | Check the release build's account creation and deletion experience. |
| Shared public layout | components/ds/public-frame.tsx and components/legal-page.tsx | Use the existing visual language and branding. |

These findings come from source inspection. Live accessibility of the planned
URLs and behavior of the release build still need verification.

## Proposed pages and App Store Connect fields

| Route | Content | Submission use |
|---|---|---|
| /app | App overview, audience, supported workflows, sanitized screenshots, sign-in and support links | Optional Marketing URL: https://www.stmarkministry.app/app |
| /support | Visible support contact, FAQs, troubleshooting, account and privacy help | Required Support URL: https://www.stmarkministry.app/support |
| /privacy | Existing policy expanded to cover the iOS app and verified data practices | Required Privacy Policy URL: https://www.stmarkministry.app/privacy |
| /terms | Existing terms with consistent name and mobile coverage | Supporting legal content; no subscription terms needed |

Apple requires a support URL with actual contact information and a privacy
policy URL. The marketing URL is optional. Apple also requires an accessible
privacy policy link within the app.

Sources: [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/),
[app privacy fields](https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy/),
and [Review Guideline 5.1.1](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage).

## App overview content draft

**Working title:** Saint Mark's Ministry

**Headline:** Stay connected to your ministry.

**Intro:** Saint Mark's Ministry brings Sunday School and Servants Preparation
into one place for the St. Mark church community. Access the lessons, attendance,
calendars, and progress information available to your ministry role.

**Sections:**

1. Sunday School — support assigned classes, attendance, lesson planning, and
   family coordination.
2. Servants Prep — follow curriculum, attendance, exams, mentoring, and program
   progress.
3. Access and privacy — ministry records are available to authorized users
   according to their roles and assignments.
4. Getting started — sign in with a ministry account; explain the appropriate
   registration or approval path for each supported audience.

**Actions:** Open ministry portal, Get support, Privacy policy. Add the App Store
download badge once the listing is available. Before release, show a plain
availability message rather than a download button without a destination.

Use the existing church logo, maroon accents, typography, and light/dark styles.
Use large readable text and a compact mobile layout. Screenshots should use
synthetic records and represent features available in the submitted iOS build.

## Support page content

Show the confirmed support address, developer@copticchurch.net, near the top
with a mailto link. The existing privacy policy lists church administration's
address and phone; verify those details before repeating them.

Start with these FAQs:

- How do I get an account or have my access approved?
- How do I reset my password?
- Why do I not see a class, child, or ministry workspace?
- How do I report an incorrect attendance or progress record?
- How do I manage notifications, if available in the submitted build?
- How do I request account deletion or help with my child's information?

For bug reports, ask for the app version, device/iOS version, affected screen,
and a short description. Ask users to omit passwords and sensitive child or
ministry records from their initial message. Start with an email link; a support
form is unnecessary for the first version. Add a response-time commitment only
after the church chooses one.

## Privacy and account deletion work

The existing policy already describes children's and guardian information,
religious/ministry records, roles, attendance, exam scores, uploads, analytics,
and retention. Review and update it against the shipping app rather than creating
a generic policy or claiming that the app collects no data.

Before submission:

- Explicitly cover the iOS app as well as the web portal and registration forms.
- Verify mobile device identifiers, push tokens, local storage, diagnostics, and
  upload/photo permissions against the actual mobile code and enabled services.
- Cover digital exam answers and monitoring activity when included in the
  submitted build. Explain what is observed without implying access to other
  apps' contents or camera/microphone monitoring that has not been verified.
- Review providers and disclosures. The current policy lists Vercel, Neon,
  Google, and push services; the web source also contains Resend email and
  optional Pusher exam updates. Determine which are active and what they process.
- Align the policy, actual retention/deletion behavior, and App Store Connect's
  data disclosures. Set the policy date when its content is actually updated.
- Keep privacy and support links accessible from iOS settings/account screens.

The web project supports parent self-registration. If the submitted iOS app
supports account creation, Apple requires users to initiate account deletion
inside the app. A support FAQ or email-only deletion instruction is insufficient
for the ordinary flow. Administrative user removal in the web project does not
establish that this requirement is satisfied.

Plan an easy-to-find Delete account action, appropriate identity confirmation,
session/access revocation, and clear information about deletion timing and any
legally required retention. Review the relationship between a login account and
shared child/ministry records before implementing deletion. Do not assume that
ministry-history preferences justify retaining all personal data indefinitely.

If completion must happen on the website, link directly from the app to the
working deletion page. A separate public /delete-account page is conditional,
not a general Apple requirement.

Source: [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

## Implementation sequence and acceptance checks

1. Use developer@copticchurch.net for support; confirm the final displayed name
   and actual release features.
2. Add /support, then review /privacy and /terms with the church's responsible
   ministry contacts. Resolve the release build's account deletion behavior.
3. Add /app using the existing design system and sanitized screenshots.
4. Add links in the web public navigation/footer and iOS account/settings UI.
5. Verify the public pages on the production domain while signed out. They must
   load directly over HTTPS and expose complete content without a login. Include
   support and app information in the password-change allowlist if needed so
   account state does not block help.
6. Check small-screen layout, keyboard navigation, readable contrast, working
   contact links, and absence of real personal records in public assets.
7. Validate account creation/deletion and privacy links in the submitted iOS
   build. Populate the exact App Store Connect URLs and reconcile data disclosures.

First-release scope is an app overview, support page, and reviewed legal pages
on the existing domain. No subscription or pricing sections are planned. This
document is a plan; it does not publish pages or establish App Store approval.
