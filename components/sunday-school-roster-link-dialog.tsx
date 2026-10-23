'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, QrCode, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ROSTER_LINK_DEFAULT_HOURS,
  ROSTER_LINK_DEFAULT_MAX_USES,
  type RosterLinkState,
} from '@/lib/sunday-school-roster-link'

interface RosterLink {
  id: string
  label: string | null
  expiresAt: string
  maxUses: number | null
  useCount: number
  revokedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  childCount: number
  state: RosterLinkState
}

const STATE_LABELS: Record<RosterLinkState, string> = {
  ACTIVE: 'Open',
  REVOKED: 'Closed',
  EXPIRED: 'Expired',
  EXHAUSTED: 'Limit reached',
}

const HOUR_OPTIONS = [
  { value: 2, label: '2 hours' },
  { value: ROSTER_LINK_DEFAULT_HOURS, label: 'Today (8 hours)' },
  { value: 24, label: '1 day' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
]

export function SundaySchoolRosterLinkDialog({
  classId,
  className,
  onSuccess,
  contactUpdateOnly = false,
}: {
  contactUpdateOnly?: boolean
  classId: string
  className: string
  onSuccess: () => void | Promise<void>
}) {
  const id = useId()
  const linkKind = contactUpdateOnly ? 'Contact update' : 'Sign-up'
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<RosterLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [label, setLabel] = useState('')
  const [expiresInHours, setExpiresInHours] = useState(ROSTER_LINK_DEFAULT_HOURS)
  const [maxUses, setMaxUses] = useState(ROSTER_LINK_DEFAULT_MAX_USES)

  // The token comes back exactly once, from the POST that mints it, and is never
  // stored in plaintext — so this URL only exists in this component's state.
  const [freshUrl, setFreshUrl] = useState('')

  const loadLinks = useCallback(async () => {
    if (!classId) return
    setLoadingLinks(true)
    try {
      const response = await fetch(
        `/api/sunday-school/roster-links?classId=${encodeURIComponent(classId)}&contactUpdateOnly=${contactUpdateOnly}`
      )
      if (!response.ok) return
      setLinks(await response.json() as RosterLink[])
    } finally {
      setLoadingLinks(false)
    }
  }, [classId, contactUpdateOnly])

  useEffect(() => {
    if (open) void loadLinks()
  }, [open, loadLinks])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setFreshUrl('')
      setLabel('')
      setCopied(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const response = await fetch('/api/sunday-school/roster-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, label, contactUpdateOnly, ...(contactUpdateOnly ? {} : { expiresInHours, maxUses }) }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || `Could not create a ${linkKind.toLowerCase()} link`)

      setFreshUrl(`${window.location.origin}/roster-signup/${body.token}`)
      setCopied(false)
      await Promise.all([loadLinks(), onSuccess()])
      toast.success(`${linkKind} link ready`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `Could not create a ${linkKind.toLowerCase()} link`)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (link: RosterLink) => {
    setRevokingId(link.id)
    try {
      const response = await fetch(`/api/sunday-school/roster-links/${link.id}`, {
        method: 'DELETE',
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not close the link')
      await loadLinks()
      toast.success(`${linkKind} link closed`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not close the link')
    } finally {
      setRevokingId(null)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(freshUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <QrCode className="mr-1 h-4 w-4" />
        {linkKind} QR
      </Button>

      {freshUrl && createPortal(
        <div data-roster-qr-print className="hidden bg-white p-8 text-center text-black print:block">
          <style>{`@media print { body > :not([data-roster-qr-print]) { display: none !important; } }`}</style>
          <h1 className="mb-2 text-2xl font-semibold">{className}</h1>
          <p className="mb-6 text-lg">{linkKind}</p>
          <div className="inline-block">
            <QRCodeSVG value={freshUrl} size={280} level="M" title={`${className} · ${linkKind}`} />
          </div>
        </div>,
        document.body
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{contactUpdateOnly ? 'Contact update QR' : 'Roster sign-up QR'}</DialogTitle>
            <DialogDescription>
              {contactUpdateOnly
                ? `Let children in ${className} add missing phone numbers using their name and birth date. Other classes cannot be reached, and existing details are never shown or replaced.`
                : `A temporary link that lets families add a child to ${className} themselves. It can only ever add to this class.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {freshUrl ? (
              <div className="space-y-4 rounded-lg border p-4 text-center dark:border-gray-700">
                <div className="mx-auto inline-block rounded-lg bg-white p-4">
                  <QRCodeSVG value={freshUrl} size={208} level="M" title={`${className} · ${linkKind}`} />
                  <p className="mt-2 text-sm font-medium text-gray-900">{className}</p>
                  <p className="text-xs text-gray-600">{linkKind}</p>
                </div>
                <div className="space-y-2">
                  <p className="break-all text-xs text-gray-600 dark:text-gray-400">{freshUrl}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                      {copied ? (
                        <Check className="mr-1 h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="mr-1 h-4 w-4" />
                      )}
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="mr-1 h-4 w-4" />
                      Print
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFreshUrl('')}>
                      Create another
                    </Button>
                  </div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Save or print this now — the link cannot be shown again.{' '}
                    {contactUpdateOnly
                      ? 'Anyone with the link and a child’s name and birth date can fill that child’s missing phone numbers in this class. Share it during class and close it afterward.'
                      : 'Anyone who has it can add a child to this class until it expires.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border p-4 dark:border-gray-700">
                <div className="space-y-2">
                  <Label htmlFor={`${id}-label`}>Label (optional)</Label>
                  <Input
                    id={`${id}-label`}
                    maxLength={80}
                    placeholder={contactUpdateOnly ? 'Sunday contact update' : 'Sunday sign-up table'}
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    disabled={creating}
                  />
                </div>
                {contactUpdateOnly ? (
                  <p className="text-sm text-ink-3">This QR code expires after two hours.</p>
                ) : <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-expiry`}>Expires in</Label>
                    <select
                      id={`${id}-expiry`}
                      value={expiresInHours}
                      onChange={e => setExpiresInHours(Number(e.target.value))}
                      disabled={creating}
                      className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      {HOUR_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-max-uses`}>{contactUpdateOnly ? 'Submission limit' : 'Sign-up limit'}</Label>
                    <Input
                      id={`${id}-max-uses`}
                      type="number"
                      min={1}
                      max={200}
                      value={maxUses}
                      onChange={e => setMaxUses(Number(e.target.value))}
                      disabled={creating}
                    />
                  </div>
                </div>}
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {creating ? 'Creating…' : `Create ${linkKind.toLowerCase()} link`}
                </Button>
              </div>
            )}

            <div className="space-y-3 border-t pt-5 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium">{linkKind} links for this class</p>
                <p className="text-xs text-gray-500">
                  {contactUpdateOnly ? 'Closing a link stops new contact submissions. Saved phone details stay on the roster.' : 'Closing a link stops new sign-ups. Children already added stay on the roster.'}
                </p>
              </div>

              {loadingLinks && links.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading links…
                </div>
              ) : links.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-gray-500 dark:border-gray-700">
                  No {linkKind.toLowerCase()} links for this class yet.
                </p>
              ) : (
                <div className="divide-y overflow-hidden rounded-lg border dark:divide-gray-700 dark:border-gray-700">
                  {links.map(link => (
                    <div
                      key={link.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {link.label || `${linkKind} link`}
                          <span
                            className={`ml-2 text-xs font-normal ${
                              link.state === 'ACTIVE'
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-gray-500'
                            }`}
                          >
                            {STATE_LABELS[link.state]}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {contactUpdateOnly ? `${link.useCount} submissions` : `${link.useCount}/${link.maxUses} used`} ·{' '}
                          {!contactUpdateOnly && `${link.childCount} joined · `}
                          {link.state === 'ACTIVE' ? 'expires' : 'expired'}{' '}
                          {new Date(link.expiresAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Created by {link.createdBy.name}</p>
                      </div>

                      {link.state === 'ACTIVE' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={revokingId !== null}
                          onClick={() => void handleRevoke(link)}
                          className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          {revokingId === link.id && (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          )}
                          Close link
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
