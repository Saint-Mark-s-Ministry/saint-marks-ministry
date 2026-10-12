'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { StatusBadge } from '@/components/ds/status-badge'
import { UserRoleTagBadges } from '@/components/user-role-tag-badges'
import { getSundaySchoolResponsibilityLabels } from '@/lib/sunday-school-user-assignments'
import { ContactLink } from '@/components/contact-link'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { FilterSelect } from '@/components/ui/filter-select'
import { ROLE_TAG_OPTIONS } from '@/lib/role-tags'
import { getLevelDisplayName, LEVEL_ORDER } from '@/lib/sunday-school-class'
import { filterContactBook, type ContactBookRoleFilter, type ContactBookGradeFilter, type ContactBookSort } from '@/lib/contact-book-filters'
import { Button } from '@/components/ui/button'
import { useContactBook } from '@/lib/swr'

export function ContactBook() {
  const { data: session, status } = useSession()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<ContactBookRoleFilter>('')
  const [grade, setGrade] = useState<ContactBookGradeFilter>('')
  const [sort, setSort] = useState<ContactBookSort>('name')
  const { data, error, isLoading, isValidating, mutate } = useContactBook(
    status === 'authenticated' ? session?.user?.id : undefined
  )

  const denied = status === 'unauthenticated' || error?.status === 401 || error?.status === 403
  // Cached contacts must never be rendered after a denial or before the
  // current effective identity's permission has been revalidated.
  const contacts = denied || error || isValidating ? undefined : data
  const visibleContacts = useMemo(() => filterContactBook(contacts?.contacts ?? [], { search, role, grade, sort }), [contacts, search, role, grade, sort])
  const hasFilters = Boolean(search.trim() || role || grade)
  const canReset = hasFilters || sort !== 'name'

  return (
    <div className="space-y-5">
      <PageHeader title="Contact Book" meta="App users’ roles, responsibilities, and contact details" />
      {denied ? (
        <Panel bodyClassName="space-y-3 p-6">
          <p role="alert">You do not have access to the contact book.</p>
          <Link href={status === 'unauthenticated' ? '/login' : '/dashboard'} className="text-accent-ink underline">Return to {status === 'unauthenticated' ? 'sign in' : 'dashboard'}</Link>
        </Panel>
      ) : (
        <Panel
          toolbar={
            <>
              <SearchField value={search} onChange={setSearch} label="Search contacts" placeholder="Search name, email, phone" className="md:w-[260px]" />
              <FilterSelect className="w-full sm:w-auto" aria-label="Filter by role" value={role} onChange={value => setRole(value as ContactBookRoleFilter)}
                options={[{ value: '', label: 'All roles' }, ...ROLE_TAG_OPTIONS.map(option => ({ value: option.value, label: option.label })), { value: 'MENTOR', label: 'Mentor' }]} />
              <FilterSelect className="w-full sm:w-auto" aria-label="Filter by grade" value={grade} onChange={value => setGrade(value as ContactBookGradeFilter)}
                options={[{ value: '', label: 'All grades' }, ...LEVEL_ORDER.map(level => ({ value: level, label: getLevelDisplayName(level) })), { value: 'UNASSIGNED', label: 'No grade assignment' }]} />
              <FilterSelect className="w-full sm:w-auto" aria-label="Sort contacts" value={sort} onChange={value => setSort(value as ContactBookSort)}
                options={[{ value: 'name', label: 'Name (A–Z)' }, { value: 'grade', label: 'Grade (Pre-K → College & Grad)' }]} />
              {canReset && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setRole(''); setGrade(''); setSort('name') }}>Clear filters</Button>}
            </>
          }
          footer={contacts ? <span className="tabular" aria-live="polite">{hasFilters ? `${visibleContacts.length} of ${contacts.total} contacts` : `${contacts.total} ${contacts.total === 1 ? 'contact' : 'contacts'}`}</span> : undefined}
        >
          {error ? (
            <div className="space-y-3 p-6">
              <p role="alert">Could not load the contact book. Please try again.</p>
              <Button variant="outline" onClick={() => void mutate()}>Try again</Button>
            </div>
          ) : status === 'loading' || isLoading || isValidating || !contacts ? (
            <p role="status" className="p-6 text-sm text-ink-3">Loading contacts…</p>
          ) : visibleContacts.length === 0 ? (
            <p role="status" className="p-6 text-sm text-ink-3">{hasFilters ? 'No contacts match your filters.' : 'No contacts yet.'}</p>
          ) : (
            <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0">
              {visibleContacts.map(contact => (
                <li key={contact.id} className="min-w-0 space-y-2 p-4 md:border-b md:border-line">
                  <h2 className="font-medium text-ink">{contact.name}</h2>
                  <div className="flex flex-wrap items-center gap-1">
                    <UserRoleTagBadges tags={contact.roleAssignments.map(assignment => assignment.tag)} legacyRole={contact.role} />
                    {getSundaySchoolResponsibilityLabels(contact.sundaySchoolServing).map(label => (
                      <StatusBadge key={label} tone="gold" dot={false}>{label}</StatusBadge>
                    ))}
                  </div>
                  <div className="flex flex-col items-start gap-2 text-sm">
                    <ContactLink kind="email" value={contact.email} name={contact.name} />
                    {contact.phone ? <ContactLink kind="phone" value={contact.phone} name={contact.name} /> : <span className="text-ink-3">No phone number</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}
