'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { StatusBadge } from '@/components/ds/status-badge'
import { getSundaySchoolResponsibilities } from '@/lib/sunday-school-user-assignments'
import { ContactLink } from '@/components/contact-link'
import { PageHeader } from '@/components/ds/page-header'
import { Initials } from '@/components/ds/person'
import { PeopleTable, PeopleTableRow, PeopleCardList, PeopleCard } from '@/components/ds/people-directory'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { FilterSelect } from '@/components/ui/filter-select'
import { CONTACT_BOOK_ROLE_OPTIONS } from '@/lib/contact-book-roles'
import { getLevelDisplayName, LEVEL_ORDER } from '@/lib/sunday-school-class'
import { filterContactBook, type ContactBookRoleFilter, type ContactBookGradeFilter, type ContactBookSort } from '@/lib/contact-book-filters'
import { Button } from '@/components/ui/button'
import type { ContactBookEntry } from '@/lib/contact-book'
import { DEFAULT_CONTACT_BOOK_FILTERS, useContactBookFilters } from '@/hooks/useContactBookFilters'
import { useContactBook } from '@/lib/swr'

export function ContactBook() {
  const { data: session, status } = useSession()
  const userId = status === 'authenticated' ? session?.user?.id : undefined
  const { filters, updateFilters, isReady: filtersReady } = useContactBookFilters(userId)
  const { search, role, grade, sort } = filters
  const { data, error, isLoading, isValidating, mutate } = useContactBook(userId)

  const denied = status === 'unauthenticated' || error?.status === 401 || error?.status === 403
  // Cached contacts must never be rendered after a denial or before the
  // current effective identity's permission has been revalidated.
  const contacts = denied || error || isValidating || !filtersReady ? undefined : data
  const visibleContacts = useMemo(() => filterContactBook(contacts?.contacts ?? [], { search, role, grade, sort }), [contacts, search, role, grade, sort])
  const hasFilters = Boolean(search.trim() || role || grade)
  const canReset = hasFilters || sort !== 'name'

  return (
    <div className="space-y-5">
      <PageHeader title="Contact Book" meta="Find people by ministry, grade, and responsibility" />
      {denied ? (
        <Panel bodyClassName="space-y-3 p-6">
          <p role="alert">You do not have access to the contact book.</p>
          <Link href={status === 'unauthenticated' ? '/login' : '/dashboard'} className="text-accent-ink underline">Return to {status === 'unauthenticated' ? 'sign in' : 'dashboard'}</Link>
        </Panel>
      ) : (
        <Panel
          toolbar={
            <>
              <div className="relative w-full md:w-auto">
                <SearchField value={search} onChange={value => updateFilters({ search: value })} label="Search contacts" placeholder="Search name, email, phone" className="md:w-[260px]" />
              </div>
              <FilterSelect className="max-w-full" aria-label="Filter by role" value={role} onChange={value => updateFilters({ role: value as ContactBookRoleFilter })}
                options={[{ value: '', label: 'All roles' }, ...CONTACT_BOOK_ROLE_OPTIONS]} />
              <FilterSelect className="max-w-full" aria-label="Filter by grade" value={grade} onChange={value => updateFilters({ grade: value as ContactBookGradeFilter })}
                options={[{ value: '', label: 'All grades' }, ...LEVEL_ORDER.map(level => ({ value: level, label: getLevelDisplayName(level) })), { value: 'UNASSIGNED', label: 'No grade assignment' }]} />
              <FilterSelect className="max-w-full" aria-label="Sort contacts" value={sort} onChange={value => updateFilters({ sort: value as ContactBookSort })}
                options={[{ value: 'name', label: 'Name (A–Z)' }, { value: 'grade', label: 'Grade (Pre-K → College & Grad)' }]} />
              {canReset && <Button variant="ghost" size="sm" onClick={() => updateFilters(DEFAULT_CONTACT_BOOK_FILTERS)} aria-label="Clear filters"><X aria-hidden />Clear</Button>}
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
          ) : (
            <>
              <PeopleTable
                label="Contacts"
                header={
                  <tr>
                    <th scope="col" className="p-2 text-left">Name</th>
                    <th scope="col" className="p-2 text-left">Email</th>
                    <th scope="col" className="p-2 text-left">Phone</th>
                    <th scope="col" className="w-44 p-2 text-left">Roles</th>
                    <th scope="col" className="w-56 p-2 text-left">Sunday School</th>
                  </tr>
                }
                empty={visibleContacts.length === 0 ? <ContactBookEmptyState filtered={hasFilters} /> : undefined}
              >
                {visibleContacts.map(contact => (
                  <PeopleTableRow key={contact.id} className="hover:bg-hover/60">
                    <td className="p-2 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Initials name={contact.name} imageUrl={contact.profileImageUrl} />
                        <span>{contact.name}</span>
                      </div>
                    </td>
                    <td className="p-2"><ContactLink kind="email" value={contact.email} name={contact.name} /></td>
                    <td className="p-2">
                      {contact.phone ? <ContactLink kind="phone" value={contact.phone} name={contact.name} /> : <span className="text-ink-3">No phone number</span>}
                    </td>
                    <td className="p-2 text-center"><ContactRoles contact={contact} /></td>
                    <td className="p-2">
                      <ContactResponsibilities contact={contact} />
                    </td>
                  </PeopleTableRow>
                ))}
              </PeopleTable>
              <PeopleCardList>
                {visibleContacts.map(contact => (
                  <PeopleCard key={contact.id} className="bg-white dark:bg-gray-900">
                    <Initials name={contact.name} imageUrl={contact.profileImageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="text-sm font-medium text-ink">{contact.name}</h2>
                        <ContactRoles contact={contact} />
                      </div>
                      <div className="flex flex-col items-start text-xs text-ink-3">
                        <ContactLink kind="email" value={contact.email} name={contact.name} />
                        {contact.phone ? <ContactLink kind="phone" value={contact.phone} name={contact.name} /> : <span>No phone number</span>}
                      </div>
                      <ContactResponsibilities contact={contact} compact />
                    </div>
                  </PeopleCard>
                ))}
                {visibleContacts.length === 0 && <ContactBookEmptyState filtered={hasFilters} />}
              </PeopleCardList>
            </>
          )}
        </Panel>
      )}
    </div>
  )
}

function ContactRoles({ contact }: { contact: ContactBookEntry }) {
  const roles = CONTACT_BOOK_ROLE_OPTIONS.filter(option => contact.roles.includes(option.value))
  return roles.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {roles.map(({ value, label }) => <StatusBadge key={value} tone={value === 'SUNDAY_SCHOOL_COORDINATOR' ? 'gold' : 'info'} dot={false} className="text-[10px]">{label}</StatusBadge>)}
    </div>
  ) : <span className="text-ink-3">—</span>
}

function ContactResponsibilities({ contact, compact = false }: { contact: ContactBookEntry; compact?: boolean }) {
  const responsibilities = getSundaySchoolResponsibilities(contact.sundaySchoolServing)
  if (compact) {
    return responsibilities.length > 0 ? (
      <p className="mt-0.5 text-[11px] text-info">
        Sunday School: {responsibilities.map(({ label, scope }) => `${label} · ${scope}`).join('; ')}
      </p>
    ) : null
  }
  return responsibilities.length > 0 ? (
    <div className="space-y-1.5 py-1">
      {responsibilities.map(({ key, label, scope }) => (
        <div key={key} className="flex flex-col items-start gap-0.5">
          <StatusBadge tone="gold" dot={false}>{label}</StatusBadge>
          <span className="text-xs text-ink-3">{scope}</span>
        </div>
      ))}
    </div>
  ) : <span className="text-ink-3">—</span>
}

function ContactBookEmptyState({ filtered }: { filtered: boolean }) {
  return <div role="status"><EmptyState message={filtered ? 'No contacts match your filters.' : 'No contacts yet.'} /></div>
}
