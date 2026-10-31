'use client'

import { useId, useState } from 'react'
import { useSession } from 'next-auth/react'
import { put } from '@vercel/blob/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APPROVAL_FORM_CONTENT_TYPE, approvalFormFileError, readApprovalFormResponse } from '@/lib/approval-form-upload'

interface FormData {
  studentName: string
  version: string
  mentorName: string
  mentorPhone: string
  mentorEmail: string
  approvalFormUrl: string | null
  approvalFormFilename: string | null
  academicYear: string | null
  pendingReview: boolean
}

async function readFormResponse(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error || 'Unable to load or save the mentor form. Please try again.')
  return data
}

export function StudentMentorFormEditor({ studentId, studentName, onSaved, disabled = false }: {
  studentId: string
  studentName: string
  onSaved: () => void | Promise<unknown>
  disabled?: boolean
}) {
  const { data: session } = useSession()
  const prefix = useId()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint = `/api/students/${encodeURIComponent(studentId)}/mentor-information`
  const role = session?.user?.role
  const canEdit = !session?.impersonating && (role === 'SUPER_ADMIN' || role === 'SERVANT_PREP')
  const busy = loading || saving || uploading

  async function load() {
    setLoading(true); setError(null)
    try { setForm(await readFormResponse(await fetch(endpoint, { cache: 'no-store' }))) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load mentor form') }
    finally { setLoading(false) }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form || busy) return
    setSaving(true); setError(null)
    try {
      const data: FormData = await readFormResponse(await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: form.version, mentorName: form.mentorName, mentorPhone: form.mentorPhone, mentorEmail: form.mentorEmail }),
      }))
      setForm(data)
      await onSaved()
      toast.success(data.pendingReview ? 'Mentor form updated. Awaiting verification.' : 'Mentor form updated')
      setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save mentor form') }
    finally { setSaving(false) }
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !form || busy) return
    const fileError = approvalFormFileError(file)
    if (fileError) { setError(fileError); return }
    setUploading(true); setError(null)
    try {
      const request = (body: object) => fetch(`${endpoint}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, version: form.version }) })
      const prepared = await readApprovalFormResponse(await request({ action: 'prepare', filename: file.name, size: file.size }))
      if (typeof prepared.pathname !== 'string' || typeof prepared.clientToken !== 'string') throw new Error('Unable to start the upload')
      const blob = await put(prepared.pathname, file, { access: 'public', token: prepared.clientToken, contentType: APPROVAL_FORM_CONTENT_TYPE, multipart: file.size > 4 * 1024 * 1024 })
      const saved = await readApprovalFormResponse(await request({ action: 'complete', filename: file.name, pathname: blob.pathname }))
      if (typeof saved.url !== 'string' || typeof saved.filename !== 'string' || typeof saved.version !== 'string') throw new Error('Unable to confirm the upload. Refresh the form to check before retrying.')
      setForm(current => current && ({ ...current, approvalFormUrl: saved.url as string, approvalFormFilename: saved.filename as string, version: saved.version as string, pendingReview: Boolean(saved.pendingReview) }))
      await onSaved()
      toast.success('Signed form updated')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload signed form') }
    finally { setUploading(false) }
  }

  if (!canEdit) return null
  return <>
    <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`Edit mentor form for ${studentName}`}
      onClick={() => { setForm(null); setOpen(true); void load() }}>Edit mentor form</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent scrollable className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mentor form · {studentName}</DialogTitle>
          <DialogDescription>Correct the mentor contact details or replace the signed form. Current-year changes require verification before a withdrawn student returns to attendance.</DialogDescription>
        </DialogHeader>
        {error && <div role="alert" className="space-y-2 text-sm text-bad"><p>{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>Refresh form</Button></div>}
        {loading ? <p role="status">Loading mentor form…</p> : form && <>
          {form.academicYear && <p className="text-sm text-ink-3">Academic year {form.academicYear}</p>}
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor={`${prefix}-name`}>Mentor name</Label><Input id={`${prefix}-name`} required maxLength={200} disabled={busy} value={form.mentorName} onChange={event => setForm({ ...form, mentorName: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor={`${prefix}-phone`}>Mentor phone</Label><Input id={`${prefix}-phone`} type="tel" required maxLength={100} disabled={busy} value={form.mentorPhone} onChange={event => setForm({ ...form, mentorPhone: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor={`${prefix}-email`}>Mentor email</Label><Input id={`${prefix}-email`} type="email" required maxLength={320} disabled={busy} value={form.mentorEmail} onChange={event => setForm({ ...form, mentorEmail: event.target.value })} /></div>
            <Button type="submit" disabled={busy}>{saving ? 'Saving…' : 'Save mentor details'}</Button>
          </form>
          <section className="space-y-2 border-t border-line pt-4">
            <Label htmlFor={`${prefix}-file`}>Signed approval form</Label>
            {form.approvalFormUrl && <a href={form.approvalFormUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-accent-ink hover:underline">{form.approvalFormFilename || 'Download current signed form'}</a>}
            <Input id={`${prefix}-file`} type="file" disabled={busy} onChange={upload} />
            <p className="text-xs text-ink-3">Any file type, up to 100 MB. Choosing a file uploads it immediately.</p>
            {uploading && <p role="status" className="text-sm">Uploading signed form…</p>}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
