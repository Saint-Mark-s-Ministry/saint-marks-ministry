'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDateUTC } from '@/lib/utils'
import { ExpandedEditableDetails } from './expanded-editable-details'
import type { Lesson, Section, LessonEdits } from './types'

interface SortableRowProps {
  lesson: Lesson
  index: number
  canEdit: boolean
  canDrag: boolean
  sections: Section[]
  edits: LessonEdits | undefined
  onEdit: (id: string, field: keyof LessonEdits, value: string | boolean) => void
  onEditResources: (id: string, resources: { title: string; url: string }[]) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onResetAttendance: (id: string) => void
  onToggleExpand: (id: string) => void
  isExpanded: boolean
}

export function SortableRow({
  lesson,
  index,
  canEdit,
  canDrag,
  sections,
  edits,
  onEdit,
  onEditResources,
  onDelete,
  onDuplicate,
  onResetAttendance,
  onToggleExpand,
  isExpanded,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, disabled: !canDrag })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isPast = new Date(lesson.scheduledDate) < new Date()
  const currentTitle = edits?.title ?? lesson.title
  const currentSpeaker = edits?.speaker ?? lesson.speaker ?? ''
  const currentSectionId = edits?.examSectionId ?? lesson.examSection.id
  const currentIsExamDay = edits?.isExamDay ?? lesson.isExamDay
  const currentStatus = (edits?.status ?? lesson.status) as Lesson['status']
  const hasAttendance = (lesson._count?.attendanceRecords || 0) > 0

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={`h-11 border-b border-line hover:bg-hover/60 ${isPast ? 'text-ink-3' : ''} ${isDragging ? 'bg-surface shadow-lg' : ''}`}
      >
        {/* Drag handle */}
        {canEdit && (
          <td
            className={`p-1 w-8 text-center ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            {...(canDrag ? { ...attributes, ...listeners } : {})}
          >
            <span aria-hidden className={`select-none ${canDrag ? 'text-ink-3' : 'text-line-strong'}`}>⠿</span>
          </td>
        )}
        {/* Lesson # */}
        <td className="p-2 text-gray-500 w-8 text-center">{index + 1}</td>
        {/* Date */}
        <td className="p-2 w-32">
          {canEdit ? (
            <Input
              type="date"
              value={edits?.scheduledDate ?? lesson.scheduledDate.slice(0, 10)}
              onChange={(e) => onEdit(lesson.id, 'scheduledDate', e.target.value)}
              className="h-8 text-xs"
            />
          ) : (
            <span className="text-sm">
              {formatDateUTC(lesson.scheduledDate, {
                weekday: undefined,
                month: 'short',
                day: 'numeric',
                year: undefined,
              })}
            </span>
          )}
        </td>
        {/* Topic */}
        <td className="p-2">
          {canEdit ? (
            <Input
              value={currentTitle}
              onChange={(e) => onEdit(lesson.id, 'title', e.target.value)}
              className="h-8 text-sm"
              placeholder="Topic title"
            />
          ) : (
            <span className="text-sm font-medium">{currentTitle}</span>
          )}
        </td>
        {/* Speaker */}
        <td className="p-2">
          {canEdit ? (
            <Input
              value={currentSpeaker}
              onChange={(e) => onEdit(lesson.id, 'speaker', e.target.value)}
              className="h-8 text-sm"
              placeholder="Speaker name"
            />
          ) : (
            <span className="text-sm text-gray-600">{currentSpeaker || '—'}</span>
          )}
        </td>
        {/* Section */}
        <td className="p-2">
          {canEdit ? (
            <select
              value={currentSectionId}
              onChange={(e) => onEdit(lesson.id, 'examSectionId', e.target.value)}
              className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-xs text-ink"
            >
              {sections.map(section => (
                <option key={section.id} value={section.id}>
                  {section.displayName}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant="outline" className="text-xs">{lesson.examSection.displayName}</Badge>
          )}
        </td>
        {/* Exam Day */}
        <td className="p-2 text-center">
          {canEdit ? (
            <input
              type="checkbox"
              checked={currentIsExamDay}
              onChange={(e) => onEdit(lesson.id, 'isExamDay', e.target.checked)}
              className="h-4 w-4"
            />
          ) : (
            currentIsExamDay && (
              <Badge variant="outline" className="border-transparent bg-warn-tint text-warn">
                Exam
              </Badge>
            )
          )}
        </td>
        {/* Status + Attendance */}
        <td className="p-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <div className="w-24 shrink-0 text-left">
              {canEdit ? (
                <select
                  value={currentStatus}
                  onChange={(e) => onEdit(lesson.id, 'status', e.target.value)}
                  className={`h-7 w-full rounded-md border px-1 text-xs font-medium ${
                    currentStatus === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700' :
                    currentStatus === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700' :
                    currentStatus === 'NO_CLASS' ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600' :
                    'bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                  }`}
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="NO_CLASS">No Class</option>
                </select>
              ) : (
                <Badge
                  className={`text-xs ${
                    currentStatus === 'COMPLETED' ? 'bg-green-500' :
                    currentStatus === 'CANCELLED' ? 'bg-red-500' :
                    currentStatus === 'NO_CLASS' ? 'bg-slate-400' :
                    'bg-maroon-600'
                  }`}
                >
                  {currentStatus === 'NO_CLASS' ? 'No Class' : currentStatus}
                </Badge>
              )}
            </div>
            <span className="w-5 shrink-0 text-left text-xs text-gray-500">
              {hasAttendance ? lesson._count.attendanceRecords : ''}
            </span>
          </div>
        </td>
        {/* Actions */}
        <td className="p-2 text-center">
          <div className="flex gap-1 justify-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onToggleExpand(lesson.id)}
              title={isExpanded ? 'Collapse details' : 'Expand details'}
            >
              {isExpanded ? '▲' : '▼'}
            </Button>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                  onClick={() => onDuplicate(lesson.id)}
                  title="Duplicate lesson"
                >
                  ⧉
                </Button>
                {hasAttendance && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                    onClick={() => onResetAttendance(lesson.id)}
                    title="Reset attendance — deletes all records and sets status to Scheduled"
                  >
                    ↺
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                  onClick={() => onDelete(lesson.id)}
                  disabled={hasAttendance}
                  title={hasAttendance ? 'Cannot delete: has attendance records' : 'Delete lesson'}
                >
                  ✕
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="border-b bg-gray-50 dark:bg-gray-900/40">
          <td colSpan={canEdit ? 9 : 8} className="p-4">
            {canEdit ? (
              <ExpandedEditableDetails
                lesson={lesson}
                edits={edits}
                onEdit={onEdit}
                onEditResources={onEditResources}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Subtitle:</span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">{lesson.subtitle || '—'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                  <span className="ml-2">{lesson.status}</span>
                  {lesson.cancellationReason && (
                    <span className="ml-1 text-gray-500">({lesson.cancellationReason})</span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{lesson.description || '—'}</p>
                </div>
                {lesson.resources && lesson.resources.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Resources:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {lesson.resources.map((r, idx) => (
                        <a
                          key={idx}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {r.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
