import type { RegistrationNameMatch } from '@/lib/registration-name-matches'

export function RegistrationNameMatchWarning({ matches, applicationType = 'registration' }: {
  matches: RegistrationNameMatch[]
  applicationType?: 'registration' | 'servant application'
}) {
  if (matches.length === 0) return null
  return (
    <section role="alert" className="rounded-md border border-warn/30 bg-warn-tint px-3 py-2 text-[13px]">
      <h3 className="font-semibold">Possible duplicate {applicationType} — exact name match</h3>
      <p className="mt-1">Existing accounts have this same full name. Compare their email addresses with the applicant’s before approving.</p>
      <ul className="mt-2 space-y-1">
        {matches.map(match => (
          <li key={match.id} className="break-words">
            <strong>{match.name}</strong> · {match.email}
            {match.isDisabled && <span> · Disabled account</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-2">A matching name may belong to a different person. Approval remains available.</p>
    </section>
  )
}
