'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StudentProfileContent } from '@/components/student-profile-content'

export function StudentProfileModal({ studentId, onClose, onRestoreFocus }: {
  studentId: string
  onClose: () => void
  onRestoreFocus?: () => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl" onCloseAutoFocus={event => {
        if (onRestoreFocus) { event.preventDefault(); onRestoreFocus() }
      }}>
        <DialogHeader>
          <DialogTitle>SP student profile</DialogTitle>
          <DialogDescription>Program information and history across all academic years.</DialogDescription>
        </DialogHeader>
        <StudentProfileContent key={studentId} studentId={studentId} />
      </DialogContent>
    </Dialog>
  )
}
