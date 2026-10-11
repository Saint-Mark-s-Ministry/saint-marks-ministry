'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ContactLink } from '@/components/contact-link'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { Button } from '@/components/ui/button'
import { useContactBook } from '@/lib/swr'

export function ContactBook() {
  const { data: session, status } = useSession()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, isLoading, isValidating, mutate } = useContactBook(
    status === 'authenticated' ? session?.user?.id : undefined, search, page
  )

  const denied = status === 'unauthenticated' || error?.status === 401 || error?.status === 403
  // Cached contacts must never be rendered after a denial or before the
  // current effective identity's permission has been revalidated.
  const contacts = denied || error || isValidating ? undefined : data
  const totalPages = contacts ? Math.max(1, Math.ceil(contacts.total / contacts.pageSize)) : 1

  return (
    <div className="space-y-5">
      <PageHeader title="Contact Book" meta="App users’ names, emails, and phone numbers" />
      {denied ? (
        <Panel bodyClassName="space-y-3 p-6">
          <p role="alert">You do not have access to the contact book.</p>
          <Link href={status === 'unauthenticated' ? '/login' : '/dashboard'} className="text-accent-ink underline">Return to {status === 'unauthenticated' ? 'sign in' : 'dashboard'}</Link>
        </Panel>
      ) : (
        <Panel
          toolbar={<SearchField value={search} onChange={value => { setSearch(value); setPage(1) }} label="Search contacts" placeholder="Search name, email, phone" className="md:w-80" />}
          footer={contacts && contacts.total > 0 ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <span>{contacts.total} contacts · Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          ) : undefined}
        >
          {error ? (
            <div className="space-y-3 p-6">
              <p role="alert">Could not load the contact book. Please try again.</p>
              <Button variant="outline" onClick={() => void mutate()}>Try again</Button>
            </div>
          ) : status === 'loading' || isLoading || isValidating || !contacts ? (
            <p role="status" className="p-6 text-sm text-ink-3">Loading contacts…</p>
          ) : contacts.contacts.length === 0 ? (
            <p role="status" className="p-6 text-sm text-ink-3">{search.trim() ? 'No contacts match your search.' : 'No contacts yet.'}</p>
          ) : (
            <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0">
              {contacts.contacts.map(contact => (
                <li key={contact.id} className="min-w-0 space-y-2 p-4 md:border-b md:border-line">
                  <h2 className="font-medium text-ink">{contact.name}</h2>
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
