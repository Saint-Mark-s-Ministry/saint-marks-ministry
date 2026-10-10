import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Terms of Service | St. Mark Church Ministry Portal',
  description: 'Terms governing use of the St. Mark Church Ministry Portal.',
}

export function TermsPageContent() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms set expectations for appropriate, secure use of the ministry portal and the records available through it."
      lastUpdated="September 19, 2026"
      sections={[
        {
          title: 'Agreement and authority',
          content: (
            <p>
              These terms are an agreement between you and the Coptic Orthodox Church of Saint Mark in Jersey
              City, New Jersey. By creating an account, submitting an application or registration, or using the
              portal, you agree to these terms and the{' '}
              <Link href="/privacy" className="font-medium text-maroon-700 underline underline-offset-2 dark:text-maroon-300">
                Privacy Policy
              </Link>
              . If you submit information for a child or another person, you confirm that you are their parent,
              legal guardian, or otherwise authorized to provide it.
            </p>
          ),
        },
        {
          title: 'Eligibility and minors',
          content: (
            <p>
              The portal is for people participating in or administering authorized St. Mark ministries. Children
              under 13 may not independently create an account or submit personal information. Their parent,
              guardian, or an authorized ministry servant must act for them. Older minors may use an account only
              with appropriate guardian permission and church authorization. The church may require confirmation
              of identity, age, authority, or guardianship.
            </p>
          ),
        },
        {
          title: 'Purpose and limits of the portal',
          content: (
            <>
              <p>
                The portal supports Sunday School and the Servants Preparation Program. Features may include
                registration, class and servant assignments, attendance, lessons, exams, mentoring, notes, files,
                notifications, annual rollover, and ministry reporting.
              </p>
              <p>
                The portal is an administrative tool. It is not an emergency service, medical record system,
                professional counseling service, or replacement for direct communication with clergy, ministry
                servants, guardians, or emergency services.
              </p>
            </>
          ),
        },
        {
          title: 'Accounts and security',
          content: (
            <p>
              You must provide accurate, current information; use only your own authorized account; keep credentials
              confidential; and promptly notify church administration of suspected compromise or unauthorized
              access. You may not share an account, allow another person to use your session, or attempt to take
              over another person&apos;s account. You are responsible for activity performed through your account until
              you notify us of a security issue.
            </p>
          ),
        },
        {
          title: 'Roles, assignments, and authorized access',
          content: (
            <p>
              Role tags grant portal modes, while ministry assignments, mentor relationships, and guardian
              relationships limit whose records a person may access. Access to a screen or record does not give
              permission to copy, download, photograph, disclose, or use the information outside the assigned
              church responsibility. You must stop using information when the relevant role, assignment, or
              relationship ends, even if technical access has not yet been removed.
            </p>
          ),
        },
        {
          title: 'Acceptable use',
          content: (
            <p>
              You may not bypass or test access controls without written authorization; scrape or bulk-export
              records; probe for vulnerabilities; disrupt the service; introduce malicious code; impersonate
              another person; use automated tools that burden the portal; upload unlawful, harmful, or infringing
              material; enter information you know is false; harass another user; or use ministry information for
              personal, political, commercial, advertising, or other non-ministry purposes.
            </p>
          ),
        },
        {
          title: 'Confidentiality and safeguarding',
          content: (
            <>
              <p>
                Ministry records, especially records about children, guardians, mentoring, conduct, grades,
                attendance, and religious participation, are confidential. Users must follow church safeguarding
                practices and report suspected abuse, safety concerns, or unauthorized disclosure through the
                church&apos;s established channels. Do not rely on a portal note as the only way to report an urgent
                concern.
              </p>
              <p>
                Do not record the substance of a confession in the portal. Confession-related features are limited
                to administrative verification that a requirement was completed.
              </p>
            </>
          ),
        },
        {
          title: 'Parent and guardian responsibilities',
          content: (
            <p>
              Parents and guardians must keep family and contact information current, use only guardian links they
              are authorized to hold, protect a child&apos;s information, and tell church administration when custody,
              guardianship, or access authority changes. A guardian link is a portal access relationship and does
              not itself establish legal custody or guardianship.
            </p>
          ),
        },
        {
          title: 'Submissions, uploads, and permissions',
          content: (
            <>
              <p>
                You retain any rights you hold in content you submit. You give the church a non-exclusive,
                royalty-free permission to host, copy, display to authorized users, modify for formatting or
                security, archive, and otherwise use that content as reasonably necessary to operate the ministries,
                protect the community, and comply with law. This permission lasts as long as the content is
                legitimately retained under the Privacy Policy.
              </p>
              <p>
                You confirm that you have the right to submit uploaded photos, forms, files, and information about
                another person. Do not upload government identifiers, financial details, medical records, confession
                content, or unrelated private material unless specifically requested for an authorized purpose.
              </p>
            </>
          ),
        },
        {
          title: 'Church materials and portal ownership',
          content: (
            <p>
              The church and its licensors retain their rights in the portal software, branding, curriculum, forms,
              reports, and ministry materials. Subject to these terms, the church gives authorized users a limited,
              revocable, non-transferable right to use the portal only for approved ministry purposes. No other
              license is granted.
            </p>
          ),
        },
        {
          title: 'Calculated results and ministry decisions',
          content: (
            <p>
              Attendance percentages, exam averages, alerts, and eligibility indicators may be generated from
              available records and can contain errors or incomplete information. They are administrative aids and
              do not replace human review. Clergy and authorized ministry servants retain responsibility for final
              assignments, exceptions, eligibility, graduation, discipline, and other ministry decisions.
            </p>
          ),
        },
        {
          title: 'Third-party services and links',
          content: (
            <p>
              The portal may rely on or link to third-party hosting, database, authentication, storage, analytics,
              push-notification, and curriculum services. Your use of a third-party service may also be governed by
              that provider&apos;s terms. The church does not control an external site merely because the portal links
              to it and is not responsible for third-party content or independent practices.
            </p>
          ),
        },
        {
          title: 'Privacy',
          content: (
            <p>
              The Privacy Policy explains what information the portal handles, why it is used, who may access it,
              service-provider disclosures, retention, and available requests. By using the portal, you acknowledge
              those practices. Where consent is legally required, we will request it separately rather than relying
              only on these terms.
            </p>
          ),
        },
        {
          title: 'Changes, availability, and maintenance',
          content: (
            <p>
              We may add, change, suspend, or discontinue portal features; correct records or configuration errors;
              and perform maintenance without guaranteeing advance notice. We will make reasonable efforts to keep
              the portal available, but service may be interrupted by maintenance, provider outages, security
              events, or circumstances outside the church&apos;s control. Users should preserve any separate records
              the church requires them to maintain.
            </p>
          ),
        },
        {
          title: 'Suspension and termination',
          content: (
            <p>
              The church may limit, suspend, or remove access when a role or assignment ends; an account is inactive;
              information or users may be at risk; these terms or church policies are violated; or continued access
              is no longer appropriate for ministry operations. You may request account closure. Closing an account
              does not require deletion of records the church legitimately retains under the Privacy Policy.
            </p>
          ),
        },
        {
          title: 'Disclaimers',
          content: (
            <p>
              The portal is provided for church ministry administration on an &quot;as is&quot; and &quot;as available&quot; basis.
              To the extent permitted by law, the church disclaims implied warranties of merchantability, fitness
              for a particular purpose, non-infringement, accuracy, and uninterrupted or error-free operation.
              Nothing in these terms excludes a warranty or right that applicable law does not allow us to exclude.
            </p>
          ),
        },
        {
          title: 'Limitation of liability',
          content: (
            <p>
              To the extent permitted by law, the church, its clergy, officers, servants, volunteers, and service
              providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive
              damages arising from portal interruption, data loss, unauthorized misuse, third-party services, or
              reliance on incomplete or outdated records. Nothing in these terms limits liability that cannot
              lawfully be limited.
            </p>
          ),
        },
        {
          title: 'Responsibility for misuse',
          content: (
            <p>
              To the extent permitted by law, you are responsible for losses or claims caused by your intentional
              misuse of the portal, unlawful disclosure of ministry records, violation of another person&apos;s rights,
              or submission of content you had no authority to provide. This section does not apply to conduct that
              cannot lawfully be assigned to you.
            </p>
          ),
        },
        {
          title: 'Governing law and disputes',
          content: (
            <p>
              These terms are governed by the laws of the State of New Jersey, without regard to conflict-of-law
              rules. Before filing a claim, the parties should make a good-faith effort to resolve the concern with
              church administration. Unless applicable law requires otherwise, legal proceedings relating to the
              portal must be brought in a state or federal court with jurisdiction in Hudson County, New Jersey.
            </p>
          ),
        },
        {
          title: 'General terms',
          content: (
            <p>
              These terms and the Privacy Policy are the entire agreement governing portal use, in addition to any
              separate church safeguarding or ministry policies that apply to your role. If a provision is
              unenforceable, the remaining provisions remain in effect. A failure to enforce a provision is not a
              waiver. You may not transfer your account or rights under these terms. The church may transfer portal
              operations to a successor church-controlled ministry or service, subject to the Privacy Policy.
            </p>
          ),
        },
        {
          title: 'Changes to these terms',
          content: (
            <p>
              We may revise these terms as the portal, providers, law, or ministry practices change. The date above
              identifies the current version. For material changes, we will provide notice through the portal or
              available contact information when reasonably practical. Continued use after the revised terms take
              effect constitutes acceptance; if you do not agree, stop using the portal and contact administration
              about closing your account or preserving required ministry records.
            </p>
          ),
        },
        {
          title: 'Contact us',
          content: (
            <p>
              Questions about these terms may be directed to church administration at Coptic Orthodox Church of
              Saint Mark, 427 West Side Avenue, Jersey City, NJ 07304; by phone at (201) 333-0004; or through the
              official church website at{' '}
              <a
                href="https://saintmark.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-maroon-700 underline underline-offset-2 dark:text-maroon-300"
              >
                saintmark.com
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  )
}

export default TermsPageContent
