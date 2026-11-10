'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useSundaySchoolQrAttendance } from '@/lib/swr'
import type { SundaySchoolLevel } from '@prisma/client'
import { checkInWindowLabel, getClassCheckInWindow } from '@/lib/sunday-school-attendance-check-in-time'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolSessionAttendance } from '@/types/sunday-school'
import Link from 'next/link'
import { QR_ATTENDANCE_GUIDE_HREF } from '@/lib/guides'

type WindowInfo = { codeVersion: string; token: string; opensAt: string; expiresAt: string; sessionId: string }
export function SundaySchoolAttendanceQr({ classId, className, date, level, userId, sessionId, onRefresh, disabled }: {
  classId: string; className: string; date: string; level: SundaySchoolLevel; userId: string; sessionId?: string
  onRefresh: (attendance: SundaySchoolSessionAttendance) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [controls, setControls] = useState(false)
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null)
  const { data, error, mutate } = useSundaySchoolQrAttendance(windowInfo?.sessionId ?? sessionId, userId)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (data) onRefresh(data) }, [data, onRefresh])
  const hours = getClassCheckInWindow(date, level)
  const eligible = Boolean(hours && hours.expiresAt.getTime() > now)
  const stored = data?.session?.checkIn
  const active = Boolean(windowInfo && eligible && new Date(windowInfo.expiresAt).getTime() > now && !stored?.closedAt && (!stored || stored.codeVersion === windowInfo.codeVersion))
  const count = data?.roster.filter(entry => entry.attendance?.selfCheckedInAt).length ?? 0
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const url = windowInfo ? `${origin}/attendance-check-in#token=${windowInfo.token}` : ''
  const request = async (action: 'open' | 'close') => {
    setBusy(true)
    try {
      const response = await fetch('/api/sunday-school/attendance/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, date, action }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not update check-in.')
      setWindowInfo(action === 'open' ? result : null)
      if (action === 'open') { setControls(false); setOpen(true) }
      await mutate()
      if (action === 'close') toast.success('QR check-in closed')
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'Could not update check-in.') }
    finally { setBusy(false) }
  }
  return <>
    <Button variant="outline" disabled={disabled || busy || !eligible} title={!eligible ? 'Choose this class’s upcoming meeting date for QR check-in' : undefined} onClick={() => windowInfo && active ? setOpen(true) : void request('open')}><QrCode />{busy ? 'Opening…' : 'Show attendance QR'}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent scrollable className="sm:max-w-3xl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="font-display text-3xl sm:text-4xl">Welcome, {className}!</DialogTitle>
          <DialogDescription className="text-base"><span className="block">{formatDateUTC(date, { weekday: 'long', month: 'long', day: 'numeric' })}</span><span className="mt-2 block text-ink-2">Scan the code, type your name, and tap “I’m here.”</span></DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          {active && url ? <div className="w-full max-w-[min(50dvh,480px)] rounded-xl bg-white p-5"><QRCodeSVG value={url} size={420} level="M" marginSize={2} className="h-auto w-full" title={`Attendance check-in for ${className}`} /></div> : <p role="status" className="py-8 text-ink-2">Check-in has finished. Tell your servant you’re here.</p>}
          {active && windowInfo && new Date(windowInfo.opensAt).getTime() > now && <p role="status" className="text-sm text-ink-2">Check-in opens during {checkInWindowLabel(level)} New York time.</p>}
          <p className="text-sm text-ink-3">No phone? Tell your servant you’re here.</p>
          {error && <p role="alert" className="text-sm text-danger">Couldn’t refresh attendance. Check your connection.</p>}
          <Button variant="ghost" size="sm" aria-expanded={controls} onClick={() => setControls(value => !value)}>Servant controls</Button>
          {controls && <div className="flex w-full flex-col items-center gap-3 border-t border-line pt-4">
            <Link href={QR_ATTENDANCE_GUIDE_HREF} className="text-sm text-accent-ink underline underline-offset-4">Watch the QR attendance guide</Link>
            <p className="text-sm text-ink-2" aria-live="polite">{count} confirmed QR check-ins · {data?.session?.checkInRequests?.length ?? 0} waiting for confirmation</p>
            <div className="flex w-full flex-wrap justify-center gap-2 [&>*]:w-full sm:[&>*]:w-auto">
            {active && <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer">Open check-in page</a></Button>}
            {active && <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(url).then(() => toast.success('Check-in link copied')).catch(() => toast.error('Could not copy the link.')) }}>Copy check-in link</Button>}
            <Button variant="outline" disabled={busy || !eligible} onClick={() => void request('open')}>{active ? 'Replace code' : 'Open a new code'}</Button>
            <Button disabled={busy} onClick={() => void request('close')}>Stop check-in</Button>
            </div>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
