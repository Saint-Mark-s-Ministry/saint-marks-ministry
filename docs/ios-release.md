# iOS app: App Store readiness

The native app lives in `apps/mobile` (Expo / React Native). It talks to the same
Next.js API as the website; only the server touches the database. This document
is the checklist for taking it to TestFlight and the App Store, what the repo
already does for review compliance, and what is still a decision or an action
for the people who own the Apple account.

## What was verified in this repository

| Area | State | Where |
|---|---|---|
| First launch while signed out (2.1) | Fixed. Screens that need a session are protected while signed out, so a fresh install lands on Sign in; a test keeps the route list in sync with the files | `apps/mobile/src/data/route-access.ts`, `app/_layout.tsx` |
| Privacy Policy / Terms reachable before sign-in (5.1.1(i)) | Done on Sign in and every public registration/sign-up screen, with consent wording on forms that create an account | `apps/mobile/src/components/legal-links.tsx` |
| Password recovery | "Forgot password?" on Sign in opens the existing web reset | `components/sign-in.tsx` |
| Older iOS versions | Glass button styles are iOS 26+; earlier versions get filled bordered buttons instead of plain text | `native-action-button.ios.tsx` |
| In-app account deletion (guideline 5.1.1(v)) | Done. Account screen → Delete account, password-confirmed; same routine and protections an administrator already has | `app/api/account/delete`, `apps/mobile/src/app/delete-account.tsx` |
| Privacy policy and terms linked in the app | Done, public routes (`/privacy`, `/terms`) | Account screen, `proxy.ts` |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | Done: required-reason APIs, no tracking, collected data types | `apps/mobile/app.json` → `ios.privacyManifests` |
| Permission strings | Camera and Photos only, each saying what for. Microphone and Face ID strings removed (unused) | `apps/mobile/app.json` plugins |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` (HTTPS only, no custom crypto) | `app.json` |
| Transport security | HTTPS enforced in release builds; no arbitrary loads | `apps/mobile/src/data/api-client.ts` |
| Sign in with Apple (4.8) | Not required: sign-in is the church's own credentials, no third-party social login | n/a |
| Tracking / ATT | None. `NSPrivacyTracking` is false | `app.json` |
| App icon | 1024×1024, no transparency | `apps/mobile/assets/app-icon.png` |
| Device family | iPhone only (`supportsTablet: false`). The layouts were built and checked for iPhone. Turn it on only after an iPad pass | `app.json` |
| Push notifications | Expo push token registered with `/api/push/mobile-subscribe`; permission asked in context; tokens removed on sign-out and on account deletion | `apps/mobile/src/data/push-notifications.ts` |

## Before the first submission (owner actions)

These can't be done from the repository.

1. **Confirm the bundle identifier.** `org.stmark.ministryportal` is provisional.
   It can't be changed after the first App Store Connect upload. Also confirm the
   Expo `owner` and EAS project in `apps/mobile/app.json`.
2. **Apple Developer / App Store Connect.** Create the app record, enable Push
   Notifications for the identifier, and create an APNs key in EAS credentials.
3. **App Privacy answers.** Match the manifest: name, email, phone, physical
   address (family records), photos (uploaded signed forms), user ID, device ID
   (push token), other user content. All linked to the user, none used for
   tracking, purpose App Functionality. Review this with whoever owns the data
   policy; it must stay in step with `/privacy`.
4. **Children's information.** The app is for a church community, but parents
   register children and a child can have a linked sign-in. Decide the age
   rating and confirm the parental-consent position (guideline 5.1.4 / COPPA)
   with the church. This is a policy decision, not a code change.
5. **App Review notes and a demo account.** Reviewers need a working sign-in.
   Create a dedicated demo account (never commit its credentials) and describe
   the roles in the review notes.
6. **Store listing.** Name, subtitle, description, keywords, support URL,
   privacy policy URL (`https://servants-prep-app.vercel.app/privacy`), and
   iPhone screenshots for the required display sizes.
7. **Build with a release Xcode.** App Store Connect rejects builds made with a
   beta Xcode/SDK. EAS uses a released image by default.

## Rollout order (the server first)

This change set includes server code, so ship it before the app:

1. **Apply the three additive migrations** with the direct (unpooled) URL.
   `bun run build` never migrates a database:
   - `20261010000000_add_changes_requested_status`: adds a registration status value
   - `20261011090000_add_pinned_sunday_school_classes`: `User.pinnedSundaySchoolClassIds`
   - `20261011150000_add_lesson_scheduler`: lesson reminder column, notification type,
     and the `MobilePushToken` table
   - Take a snapshot first and verify `/api/health` afterwards (see `AGENTS.md`).
2. **Deploy the web/API.** The new daily cron
   `/api/cron/sunday-school-lesson-reminders` in `vercel.json` uses the existing
   `CRON_SECRET`.
3. **Build and submit the app**, pointing at the production API:

   ```bash
   cd apps/mobile
   eas build --platform ios --profile production
   eas submit --platform ios --profile production
   ```

   `beta` is a directly installable internal build; `production` is for
   App Store Connect / TestFlight. Both set `EXPO_PUBLIC_API_URL`.

## Day-to-day commands

EAS profiles pin Bun 1.4.3 to support the checked-in version-2 lockfile. Bun
1.3.14 cannot parse that format and fails the frozen dependency install before
native compilation. Use the pinned version when checking a clean install.

```bash
bun run mobile:typecheck
bun run mobile:export          # iOS + Android bundles, not signed binaries
bun test:run __tests__/mobile
bun run mobile:ios -- --localhost   # local simulator against bun dev
```

## Known gaps

- **Not exercised on a physical device.** Behavior is covered by unit tests,
  typechecking, API checks and Simulator review of earlier screens. Run a full
  TestFlight pass (every role) before submitting.
- **View As is read-only in the app.** A super administrator can view as another
  person; the app refuses every write while viewing as (and hides Delete account and
  the Contact Book access switch). The server enforces the same rule.
- **Account deletion is permanent and mirrors admin deletion.** A person whose
  account holds records the church must keep (confidential priest notes, roster
  import history) is told to contact an administrator, who can disable the
  account. Super administrators can't delete their own account.
- **iPad is disabled** until the layouts are reviewed there.
- **Google sign-in, offline sync, and profile-photo upload from settings** are not
  implemented.
