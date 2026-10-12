import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy | St. Mark Church Ministry Portal',
  description: 'How the St. Mark Church Ministry Portal collects, uses, shares, and protects information.',
}

export function PrivacyPageContent() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains how information is handled when families, students, servants, mentors, clergy, and administrators use the ministry portal."
      lastUpdated="September 20, 2026"
      sections={[
        {
          title: 'Who operates the portal and what this policy covers',
          content: (
            <>
              <p>
                The St. Mark Church Ministry Portal is operated for the Coptic Orthodox Church of Saint Mark
                in Jersey City, New Jersey. It supports the church&apos;s Sunday School and Servants Preparation
                ministries. This policy applies to the portal, its registration forms, and the ministry records
                maintained through it. It does not govern unrelated church websites or third-party sites.
              </p>
              <p>
                In this policy, &quot;the church,&quot; &quot;we,&quot; and &quot;us&quot; refer to the Coptic Orthodox Church of Saint
                Mark and the authorized ministry servants who operate the portal on its behalf.
              </p>
            </>
          ),
        },
        {
          title: 'Information we collect',
          content: (
            <>
              <p>
                Account and contact information may include a person&apos;s name, email address, username, phone
                number, profile photo, ministry roles, service start date, account status, password hash,
                Google sign-in identifier, and sign-in or session information.
              </p>
              <p>
                Servants Preparation records may include enrollment and year level, mentor and father-of-
                confession information, attendance and expected-absence reasons, conduct records, exam scores,
                lesson progress, eligibility or graduation status, notes, signed approval forms, profile photos,
                and attendance or confession-verification slips. The portal is not intended to record the
                content of a confession.
              </p>
              <p>
                Sunday School records may include a child&apos;s name, date of birth, cell number where appropriate,
                father-of-confession information, grade or level, class and yearly enrollment, attendance,
                visitation status, phone call follow-up dates, outcomes, callers and notes, guardian contact
                information and relationship, servant assignments and attendance, lesson plans, registrations,
                feedback, related notes, and
                confidential pastoral notes restricted to their authors and clergy with active Priest access.
                Roster imports may also record source filename, row outcomes, and import history.
              </p>
              <p>
                We also maintain role and assignment history, notification preferences and messages, push
                subscription details, uploads, support communications, and security or audit records such as
                who made an administrative change and when it occurred.
              </p>
            </>
          ),
        },
        {
          title: 'Where information comes from',
          content: (
            <p>
              Information may be provided by you, a parent or guardian, the child where appropriate, authorized
              church staff or servants, a mentor, or an administrator importing an existing ministry roster.
              We also receive limited account information from Google if you choose Google sign-in, and
              technical information automatically from your browser, device, and our service providers.
            </p>
          ),
        },
        {
          title: 'Children and guardian information',
          content: (
            <>
              <p>
                The portal is not intended for unsupervised self-registration by children under 13. A parent,
                legal guardian, or authorized ministry servant should provide information for a younger child.
                A child does not need an email address or portal account to appear on a Sunday School roster.
              </p>
              <p>
                A guardian account receives access to a child&apos;s information only after an active guardian
                relationship is approved or created in the portal. Parents and guardians may ask to review or
                correct their child&apos;s information, end a guardian link, or request deletion, subject to identity
                verification and records the church must reasonably retain for safeguarding, ministry history,
                or legal obligations.
              </p>
              <p>
                If you believe a child submitted personal information without appropriate guardian authorization,
                contact us so we can review the account and take appropriate action.
              </p>
            </>
          ),
        },
        {
          title: 'How we use information',
          content: (
            <p>
              We use information to authenticate users; review applications; manage accounts, roles, classes,
              rosters, and guardian links; record attendance, service, lessons, exams, mentoring, and progress;
              coordinate annual rollover; communicate ministry updates; send requested notifications; support
              users; investigate misuse; maintain audit history; protect the portal and church community; and
              improve the portal&apos;s reliability and ministry administration.
            </p>
          ),
        },
        {
          title: 'Eligibility calculations and human review',
          content: (
            <p>
              The portal may calculate attendance percentages, exam averages, missing requirements, or an
              eligibility status from ministry records. These calculations are administrative aids, not final
              decisions made solely by an automated system. Authorized ministry servants may review the underlying
              records, correct errors, and make exceptions or final ministry decisions.
            </p>
          ),
        },
        {
          title: 'Who can access ministry records',
          content: (
            <p>
              Access is limited by role tags, current ministry assignments, mentor relationships, and guardian
              relationships. Super administrators operate the portal; clergy may receive broad read-only access;
              coordinators and servants receive the scope needed for assigned classes or programs; mentors receive
              access to assigned mentees; students receive access to their own records; and guardians receive
              access to linked children. Each confidential pastoral note is attached to a specific Sunday School
              visitation and is available only to the person who submitted it and users with active Priest access;
              it is not included in the general visitation history. Administrative access alone does not grant
              access to those notes. Authorized people must use information only for their church duties.
            </p>
          ),
        },
        {
          title: 'Service providers and other disclosures',
          content: (
            <>
              <p>
                We use service providers to operate the portal, including Vercel for application hosting, file
                storage, performance measurement, and privacy-focused web analytics; Neon for managed database
                hosting; Google for optional sign-in and linked ministry resources; and browser or device push
                services when you enable notifications. These providers may process information only as needed
                to provide their services and under their own terms and privacy notices.
              </p>
              <p>
                We may also disclose information when required by law; to respond to a valid legal request; to
                investigate abuse or a security incident; to protect a child or another person from harm; or in
                connection with a transition to a successor church-operated service. We do not sell personal
                information, share it for cross-context behavioral advertising, or use ministry records for
                targeted advertising.
              </p>
            </>
          ),
        },
        {
          title: 'Cookies, local storage, and analytics',
          content: (
            <>
              <p>
                The portal uses essential cookies and browser storage for secure sign-in, session continuity,
                security protections, theme preferences, and selected portal settings. Blocking essential cookies
                may prevent sign-in or other features from working.
              </p>
              <p>
                Vercel Web Analytics and Speed Insights may collect page or route, referrer, timestamp, approximate
                location, browser, operating system, device type, and performance measurements. Vercel describes
                its standard web analytics as aggregated and not tied to a person or persistent cross-site
                identifier. We do not intentionally send names, contact details, ministry notes, or record contents
                as analytics events.
              </p>
            </>
          ),
        },
        {
          title: 'Push notifications',
          content: (
            <p>
              Push notifications are optional. If enabled, we store a device subscription endpoint, encryption
              keys, and limited device or browser information so ministry notifications can be delivered. You can
              disable notifications in your browser or device settings. Notification previews may be visible on a
              locked device, so choose device settings appropriate for your privacy needs.
            </p>
          ),
        },
        {
          title: 'Retention and deletion',
          content: (
            <>
              <p>
                We retain information for as long as it is reasonably needed to run the ministries, preserve
                academic-year and service history, support safeguarding and accountability, resolve disputes,
                maintain security, and meet legal obligations. Role grants, assignments, attendance, audit records,
                and ministry outcomes may be archived rather than overwritten so the church can understand the
                historical record.
              </p>
              <p>
                Retention depends on the record&apos;s purpose, sensitivity, age, and whether an account or ministry
                relationship remains active. When information is no longer reasonably needed, we may delete,
                anonymize, or securely archive it. Provider backups and logs may remain for a limited period after
                deletion. A request to delete an account does not necessarily remove records that must remain part
                of another person&apos;s ministry history, an audit trail, or a safeguarding record.
              </p>
            </>
          ),
        },
        {
          title: 'Security and data location',
          content: (
            <>
              <p>
                We use role-based access controls, assignment-based scoping, password hashing, authenticated
                sessions, transport encryption, administrative audit records, and service-provider safeguards.
                Access should be removed when a person&apos;s ministry responsibility ends. No online system can
                guarantee absolute security.
              </p>
              <p>
                The portal and its providers may process or store information in the United States and other
                locations where a provider operates. If you believe an account or record has been exposed, notify
                church administration promptly.
              </p>
            </>
          ),
        },
        {
          title: 'Your choices and privacy requests',
          content: (
            <p>
              You may ask to access, correct, or receive information associated with your account or linked child;
              ask us to review an access relationship; withdraw optional push permission; or request account or
              record deletion. We may need to verify your identity, authority, or guardianship before responding.
              We may deny or limit a request when necessary to protect another person, preserve confidential church
              records, maintain safeguarding or audit history, or comply with law, and will explain the reason when
              appropriate.
            </p>
          ),
        },
        {
          title: 'Sensitive information and free-text fields',
          content: (
            <p>
              Ministry records can be sensitive, particularly records concerning children, religious participation,
              conduct, mentoring, confession verification, and pastoral care. Even in a priest-only field, record
              only what is necessary for the authorized ministry purpose. Do not enter medical details, government
              identifiers, financial information, the substance of a confession, or other highly sensitive
              information into a note or upload unless the church specifically requests it and it is necessary and
              authorized. The priest-only field is not intended to store the content of a confession. For
              emergencies, contact emergency services, clergy, or authorized ministry servants directly rather than relying on the
              portal.
            </p>
          ),
        },
        {
          title: 'External links',
          content: (
            <p>
              The portal may link to Google Drive, curriculum resources, or other websites. Those services are
              governed by their own privacy practices. A link does not mean the church controls how the external
              service collects or uses information.
            </p>
          ),
        },
        {
          title: 'Changes to this policy',
          content: (
            <p>
              We may update this policy as the portal, providers, or ministry practices change. The date above
              identifies the latest revision. When a change materially affects how personal information is used,
              we will provide additional notice through the portal or available contact information when reasonably
              practical and seek consent when required.
            </p>
          ),
        },
        {
          title: 'Contact us',
          content: (
            <p>
              For privacy questions or requests, contact church administration at Coptic Orthodox Church of Saint
              Mark, 427 West Side Avenue, Jersey City, NJ 07304; call (201) 333-0004; or use the official church
              website at{' '}
              <a
                href="https://saintmark.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-maroon-700 underline underline-offset-2 dark:text-maroon-300"
              >
                saintmark.com
              </a>
              . Please do not include sensitive child or ministry information in an unsecured initial message.
            </p>
          ),
        },
      ]}
    />
  )
}

export default PrivacyPageContent
