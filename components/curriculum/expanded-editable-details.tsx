'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { Lesson, LessonEdits } from './types'

interface ExpandedEditableDetailsProps {
  lesson: Lesson
  edits: LessonEdits | undefined
  onEdit: (id: string, field: keyof LessonEdits, value: string | boolean) => void
  onEditResources: (id: string, resources: { title: string; url: string }[]) => void
}

export function ExpandedEditableDetails({
  lesson,
  edits,
  onEdit,
  onEditResources,
}: ExpandedEditableDetailsProps) {
  const currentSubtitle = edits?.subtitle ?? lesson.subtitle ?? ''
  const currentDescription = edits?.description ?? lesson.description ?? ''
  const currentCancellationReason = edits?.cancellationReason ?? lesson.cancellationReason ?? ''
  const currentStatus = (edits?.status ?? lesson.status) as Lesson['status']
  const currentResources: { title: string; url: string }[] = edits?.resources ?? lesson.resources.map(r => ({ title: r.title, url: r.url }))

  const handleResourceChange = (idx: number, field: 'title' | 'url', value: string) => {
    const updated = [...currentResources]
    updated[idx] = { ...updated[idx], [field]: value }
    onEditResources(lesson.id, updated)
  }

  const handleRemoveResource = (idx: number) => {
    const updated = currentResources.filter((_, i) => i !== idx)
    onEditResources(lesson.id, updated)
  }

  const handleAddResource = () => {
    onEditResources(lesson.id, [...currentResources, { title: '', url: '' }])
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Subtitle */}
      <div>
        <label className="text-xs font-medium text-gray-500">Subtitle</label>
        <Input
          value={currentSubtitle}
          onChange={(e) => onEdit(lesson.id, 'subtitle', e.target.value)}
          className="h-8 text-sm mt-0.5"
          placeholder="Subtitle (optional)"
        />
      </div>

      {/* Cancellation reason for canceled meetings or no-class days */}
      {(currentStatus === 'CANCELLED' || currentStatus === 'NO_CLASS') && (
        <div>
          <label className="text-xs font-medium text-gray-500">Cancellation Reason</label>
          <Textarea
            value={currentCancellationReason}
            onChange={(e) => onEdit(lesson.id, 'cancellationReason', e.target.value)}
            className="text-sm mt-0.5 min-h-[60px]"
            placeholder="Reason for cancellation"
          />
        </div>
      )}

      {/* Description */}
      <div className="md:col-span-2">
        <label className="text-xs font-medium text-gray-500">Description</label>
        <Textarea
          value={currentDescription}
          onChange={(e) => onEdit(lesson.id, 'description', e.target.value)}
          className="text-sm mt-0.5 min-h-[80px]"
          placeholder="Lesson description (optional)"
        />
      </div>

      {/* Resources */}
      <div className="md:col-span-2">
        <label className="text-xs font-medium text-gray-500">Resources</label>
        <div className="space-y-2 mt-1">
          {currentResources.map((resource, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                value={resource.title}
                onChange={(e) => handleResourceChange(idx, 'title', e.target.value)}
                className="h-8 text-sm flex-1"
                placeholder="Resource title"
              />
              <Input
                value={resource.url}
                onChange={(e) => handleResourceChange(idx, 'url', e.target.value)}
                className="h-8 text-sm flex-[2]"
                placeholder="https://..."
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs text-red-600 hover:text-red-700 shrink-0"
                onClick={() => handleRemoveResource(idx)}
                title="Remove resource"
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleAddResource}
          >
            + Add Resource
          </Button>
        </div>
      </div>
    </div>
  )
}
