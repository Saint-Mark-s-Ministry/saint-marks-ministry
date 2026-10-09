'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Eye, EyeOff, ShieldCheck, X } from 'lucide-react'
import { Initials } from '@/components/ds/person'
import { toast } from 'sonner'
import type { RoleTag, UserRole } from '@prisma/client'
import { replaceBrowserLocation } from '@/lib/browser-navigation'
import { defaultDashboardPath } from '@/lib/dashboard-navigation'
import { consumeViewAsReturnPath, rememberViewAsReturnPath } from '@/lib/view-as-navigation'

export { defaultDashboardPath } from '@/lib/dashboard-navigation'

interface UserRow {
  id: string
  name: string
  email: string
  role: UserRole
  roleAssignments: { tag: RoleTag }[]
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  PRIEST: 'Priest',
  SERVANT_PREP: 'Servants Prep Leader',
  MENTOR: 'Mentor',
  STUDENT: 'Servants Prep Student',
  SERVANT: 'Sunday School Servant',
  PARENT: 'Parent',
}

const TAG_LABEL: Record<RoleTag, string> = {
  SUPER_ADMIN: 'Super Admin',
  PRIEST: 'Priest',
  SERVANTS_PREP_SERVANT: 'SP Servant',
  SERVANTS_PREP_STUDENT: 'SP Student',
  SUNDAY_SCHOOL_SERVANT: 'SS Servant',
  SUNDAY_SCHOOL_STUDENT: 'SS Student',
  PARENT: 'Parent',
}

export function ViewAsMode() {
  const { data: session, update } = useSession()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const viewingAs = session?.impersonating ?? null
  const isSuperAdminActor = session?.user?.role === 'SUPER_ADMIN' || !!viewingAs

  useEffect(() => {
    if (!isSuperAdminActor) return

    const handleViewAsShortcut = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'q' &&
        !event.repeat
      ) {
        event.preventDefault()
        setOpen((currentlyOpen) => !currentlyOpen)
      }
    }

    window.addEventListener('keydown', handleViewAsShortcut)
    return () => window.removeEventListener('keydown', handleViewAsShortcut)
  }, [isSuperAdminActor])

  useEffect(() => {
    if (!open || !isSuperAdminActor) return
    let cancelled = false

    const fetchUsers = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const params = new URLSearchParams({ limit: '30' })
        if (query.trim()) params.set('search', query.trim())
        const response = await fetch(`/api/admin/view-as/users?${params.toString()}`)
        if (!response.ok) {
          throw new Error(response.status === 403 ? 'View as needs an active Super Admin role grant.' : 'Unable to load users')
        }
        const data = await response.json() as UserRow[]
        if (!cancelled) setUsers(data)
      } catch (error) {
        if (!cancelled) {
          setUsers([])
          setLoadError(error instanceof Error ? error.message : 'Unable to load users')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const timer = window.setTimeout(fetchUsers, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, isSuperAdminActor])

  if (!session?.user || !isSuperAdminActor) return null

  const pick = async (userId: string) => {
    setBusy(true)
    try {
      const switchingViewedUser = !!viewingAs
      const updated = await update({ impersonate: userId })
      if (!updated?.impersonating || updated.user?.id !== userId) {
        toast.error('View as could not be started. Confirm your Super Admin access and try again.')
        return
      }
      if (!switchingViewedUser) rememberViewAsReturnPath()
      // A full navigation to the viewed account's home: staying on this page would
      // refetch it as that account (403s) and keep data cached for the admin.
      replaceBrowserLocation(defaultDashboardPath(updated.user))
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      const updated = await update({ impersonate: null })
      if (updated?.impersonating || !updated?.user) {
        toast.error('View as could not be stopped. Sign out if the problem continues.')
        return
      }
      // Navigate with the browser rather than the client router. This both
      // clears data cached for the viewed user and prevents Next.js from
      // restoring the target user's old route during the identity change.
      replaceBrowserLocation(
        consumeViewAsReturnPath(defaultDashboardPath(updated.user))
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {viewingAs && <ViewAsBanner session={session} busy={busy} onStop={stop} />}
      <PickerDialog
        open={open}
        onOpenChange={setOpen}
        query={query}
        setQuery={setQuery}
        users={users}
        loading={loading}
        error={loadError}
        busy={busy}
        actorUserId={viewingAs?.originalId ?? session.user.id}
        effectiveUserId={session.user.id}
        onPick={pick}
      />
    </>
  )
}

function ViewAsBanner({
  session,
  busy,
  onStop,
}: {
  session: {
    user?: { name?: string | null; email?: string | null; role: UserRole } | null
    impersonating?: { originalName: string | null; originalEmail: string | null } | null
  }
  busy: boolean
  onStop: () => void
}) {
  // Floating, so it never shifts the shell; sits above the phone tab bar.
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] z-50 mx-auto flex max-w-[640px] items-center gap-3 rounded-[10px] border border-warn/40 bg-warn-tint py-2 pr-2 pl-3.5 text-[13px] text-ink shadow-lg md:bottom-5 print:hidden"
    >
      <Eye className="size-4 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">Viewing as {session.user?.name ?? session.user?.email}</span>
        <span className="text-ink-2"> · {ROLE_LABEL[session.user?.role ?? ''] ?? session.user?.role} · read-only</span>
        <span className="hidden text-ink-3 lg:inline"> · Ctrl Q to switch</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onStop}
        className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 font-medium text-ink hover:bg-hover disabled:opacity-50"
      >
        <EyeOff className="size-3.5" strokeWidth={1.75} aria-hidden />
        Stop
      </button>
    </div>
  )
}

function PickerDialog({
  open,
  onOpenChange,
  query,
  setQuery,
  users,
  loading,
  error,
  busy,
  actorUserId,
  effectiveUserId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  setQuery: (query: string) => void
  users: UserRow[]
  loading: boolean
  error: string | null
  busy: boolean
  actorUserId: string
  effectiveUserId: string
  onPick: (id: string) => void
}) {
  const grouped = users.reduce<Record<string, UserRow[]>>((groups, user) => {
    if (!groups[user.role]) groups[user.role] = []
    groups[user.role].push(user)
    return groups
  }, {})
  const groupOrder: UserRole[] = ['PRIEST', 'SERVANT_PREP', 'MENTOR', 'SERVANT', 'PARENT', 'STUDENT', 'SUPER_ADMIN']

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed top-3 left-1/2 z-50 w-full max-w-[640px] -translate-x-1/2 px-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:top-[12%] sm:px-4">
          <DialogPrimitive.Title className="sr-only">View as another user</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Preview the application with another user&apos;s access. All changes are blocked.
          </DialogPrimitive.Description>
          {/* The server already filters by the query; cmdk filtering on top would hide matches. */}
          <Command shouldFilter={false} className="overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl" label="View as user">
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Eye className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="View as… search by name or email"
                className="h-12 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 sm:text-sm"
              />
              <span className="hidden items-center gap-1 rounded-sm bg-warn-tint px-1.5 py-0.5 text-[11px] font-medium text-warn sm:inline-flex">
                <ShieldCheck className="size-3" aria-hidden /> Read-only
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <Command.List className="max-h-[70vh] overflow-y-auto overscroll-contain p-1.5 sm:max-h-[60vh]">
              {error ? (
                <p role="alert" className="m-1.5 rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">{error}</p>
              ) : (
                <Command.Empty className="py-6 text-center text-[13px] text-ink-3">
                  {loading ? 'Searching…' : 'No users found.'}
                </Command.Empty>
              )}
              {groupOrder.map((role) => {
                const rows = grouped[role]
                if (!rows?.length) return null
                return (
                  <Command.Group
                    key={role}
                    heading={ROLE_LABEL[role]}
                    className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase"
                  >
                    {rows.map((user) => {
                      const isActor = user.id === actorUserId
                      const isCurrent = user.id === effectiveUserId
                      return (
                        <Command.Item
                          key={user.id}
                          value={user.id}
                          disabled={busy || isActor || isCurrent}
                          onSelect={() => onPick(user.id)}
                          // cmdk always sets data-disabled ("true"/"false"), so match the value.
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] aria-selected:bg-hover data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45"
                        >
                          <Initials name={user.name} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">{user.name}</span>
                            <span className="block truncate text-xs text-ink-3">{user.email}</span>
                          </span>
                          <span className="hidden max-w-[230px] flex-wrap justify-end gap-1 md:flex">
                            {user.roleAssignments.slice(0, 3).map(({ tag }) => (
                              <span key={tag} className="rounded-sm bg-raised px-1.5 py-0.5 text-[11px] text-ink-2">
                                {TAG_LABEL[tag]}
                              </span>
                            ))}
                          </span>
                          {(isActor || isCurrent) && (
                            <span className="text-[11px] font-medium text-ink-3">{isActor ? 'You' : 'Current'}</span>
                          )}
                        </Command.Item>
                      )
                    })}
                  </Command.Group>
                )
              })}
            </Command.List>
            <div className="flex items-center justify-between border-t border-line px-3.5 py-2 text-[11.5px] text-ink-3">
              <span>Permissions and scope match the selected account</span>
              <span className="hidden sm:inline">
                <kbd className="rounded-[4px] border border-line-strong px-[5px] font-mono text-[11px]">Ctrl Q</kbd> close · expires after 30 minutes
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
