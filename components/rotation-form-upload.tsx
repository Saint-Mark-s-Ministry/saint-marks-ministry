'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROTATION_FORM_FILE_TYPES, ROTATION_FORM_MAX_BYTES, rotationCanSubmit } from '@/lib/rotation-forms'
import type { RotationFormSummary } from '@/types/rotation-forms'

export function RotationFormUpload({ assignment, onUploaded }: {
  assignment: { assignmentId: string; startDate: string; totalWeeks: number; isActive: boolean; rotationForm: RotationFormSummary | null }
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const form = assignment.rotationForm
  const eligible = assignment.isActive && assignment.totalWeeks === 4 && rotationCanSubmit(assignment.startDate) && form?.status !== 'APPROVED'

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file || !confirmed || !eligible) return
    if (!ROTATION_FORM_FILE_TYPES.includes(file.type) || file.size > ROTATION_FORM_MAX_BYTES || !file.size) {
      toast.error('Upload a photo or PDF under 4.5 MB')
      return
    }
    setUploading(true)
    try {
      const data = new FormData()
      data.append('assignmentId', assignment.assignmentId)
      data.append('file', file)
      data.append('completedWeeks', '4')
      const response = await fetch('/api/sunday-school/rotation-forms', { method: 'POST', body: data })
      const result = await response.json().catch(() => ({ error: 'Unable to upload the form. Try a photo or PDF under 4.5 MB.' }))
      if (!response.ok) throw new Error(result.error || 'Unable to upload rotation form')
      toast.success('Rotation form submitted for review')
      setFile(null)
      setConfirmed(false)
      onUploaded()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to upload rotation form') }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-3 border-t border-line px-4 py-4">
      <h3 className="text-sm font-semibold text-ink">Signed rotation form</h3>
      {form && <div className="space-y-1 text-sm">
        <a href={form.fileUrl} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">View submitted form</a>
        <p className="text-ink-2">{form.status === 'PENDING' ? 'Awaiting review. You remain in this class until all four weeks are approved.' : form.status === 'APPROVED' ? 'Four weeks approved.' : 'Changes requested. Correct the form and upload it again.'}</p>
        {form.reviewNotes && <p className="text-ink-2">{form.reviewNotes}</p>}
      </div>}
      {assignment.isActive && form?.status !== 'APPROVED' && <>
        <p className="text-sm text-ink-2">Complete all four weeks and have each week signed. Upload one photo or PDF of the completed form. Approval moves you to the next grade.</p>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/student/attendance-slip">Print rotation form</Link></Button>
        {!eligible ? <p className="text-sm text-ink-3">Complete all four weeks and collect all four signatures before uploading your form.</p> : <form onSubmit={upload} className="space-y-3">
          <label htmlFor={`rotation-form-${assignment.assignmentId}`} className="block text-sm font-medium">Completed four-week form</label>
          <Input id={`rotation-form-${assignment.assignmentId}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" disabled={uploading} onChange={event => setFile(event.target.files?.[0] ?? null)} />
          <p className="text-xs text-ink-3">Photo or PDF, maximum 4.5 MB.</p>
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={uploading} className="mt-1" />
            I completed all four weeks and each week is signed on this form.
          </label>
          <Button type="submit" disabled={!file || !confirmed || uploading}><Upload />{uploading ? 'Uploading…' : form ? 'Replace rotation form' : 'Upload rotation form'}</Button>
        </form>}
      </>}
    </div>
  )
}
