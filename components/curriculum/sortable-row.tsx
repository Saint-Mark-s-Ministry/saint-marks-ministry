'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import styles from './schedule.module.css'
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

  const currentTitle = edits?.title ?? lesson.title
  const currentSpeaker = edits?.speaker ?? lesson.speaker ?? ''
  const currentSectionId = edits?.examSectionId ?? lesson.examSection.id
  const currentIsExamDay = edits?.isExamDay ?? lesson.isExamDay
  const currentStatus = (edits?.status ?? lesson.status) as Lesson['status']
  const isCancelled = currentStatus === 'CANCELLED' || currentStatus === 'NO_CLASS'
  const currentSection = sections.find(section => section.id === currentSectionId) ?? lesson.examSection
  const notesField = isCancelled ? 'cancellationReason' : 'description'
  const currentNotes = edits?.[notesField] ?? lesson[notesField] ?? ''
  const hasAttendance = (lesson._count?.attendanceRecords || 0) > 0

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={`${styles.row} ${isDragging ? styles.dragging : ''}`}
        data-edited={!!edits}
      >
        {/* Drag handle */}
        {canEdit && (
          <td
            className={`p-1 w-8 text-center ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            {...(canDrag ? { ...attributes, ...listeners } : {})}
          >
            <span className={`select-none ${canDrag ? 'text-current opacity-50' : 'text-current opacity-20'}`}>⠿</span>
          </td>
        )}
        <td className="text-center font-semibold tabular-nums">{lesson.lessonNumber || index + 1}</td>
        <td>
          {canEdit ? (
            <Input
              type="date"
              aria-label={`Date for meeting ${lesson.lessonNumber}`}
              value={edits?.scheduledDate ?? lesson.scheduledDate.slice(0, 10)}
              onChange={(e) => onEdit(lesson.id, 'scheduledDate', e.target.value)}
              className={styles.cellInput}
            />
          ) : (
            <span className="whitespace-nowrap tabular-nums">
              {formatDateUTC(lesson.scheduledDate, { month: 'numeric', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </td>
        <td>
          {canEdit ? (
            <select
              value={currentSectionId}
              aria-label={`Block for meeting ${lesson.lessonNumber}`}
              onChange={(e) => onEdit(lesson.id, 'examSectionId', e.target.value)}
              className={styles.block}
              data-section={currentSection.name}
            >
              {sections.map(section => (
                <option key={section.id} value={section.id}>{section.displayName}</option>
              ))}
            </select>
          ) : (
            <span className={styles.block} data-section={currentSection.name}>{currentSection.displayName}</span>
          )}
        </td>
        <td>
          <div className="flex items-center gap-1">
            {canEdit ? (
              <Input
                value={currentTitle}
                aria-label={`Topic for meeting ${lesson.lessonNumber}`}
                onChange={(e) => onEdit(lesson.id, 'title', e.target.value)}
                className={styles.cellInput}
                placeholder="Topic title"
              />
            ) : (
              <span className="flex-1 font-medium">{currentTitle}</span>
            )}
            {canEdit ? (
              <label className={styles.examToggle} title="Exam day">
                <input
                  type="checkbox"
                  aria-label={`Exam day for meeting ${lesson.lessonNumber}`}
                  checked={currentIsExamDay}
                  onChange={(e) => onEdit(lesson.id, 'isExamDay', e.target.checked)}
                />
                <span>Exam</span>
              </label>
            ) : currentIsExamDay && <Badge variant="outline" className="text-[10px] border-pink-300 text-pink-700 dark:text-pink-200">Exam</Badge>}
          </div>
        </td>
        <td>
          <div className="flex items-center justify-center gap-1">
            {canEdit ? (
              <select
                value={currentStatus}
                aria-label={`Status for meeting ${lesson.lessonNumber}`}
                onChange={(e) => onEdit(lesson.id, 'status', e.target.value)}
                className={styles.status}
                data-status={currentStatus}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_CLASS">No class</option>
              </select>
            ) : (
              <span className={styles.status} data-status={currentStatus}>
                {{ SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_CLASS: 'No class' }[currentStatus]}
              </span>
            )}
            {hasAttendance && <span className={styles.attendance} title="Attendance records">{lesson._count.attendanceRecords}</span>}
          </div>
        </td>
        <td>
          {canEdit ? (
            <Input
              value={currentSpeaker}
              aria-label={`Speaker for meeting ${lesson.lessonNumber}`}
              onChange={(e) => onEdit(lesson.id, 'speaker', e.target.value)}
              className={styles.cellInput}
              placeholder="Speaker name"
            />
          ) : <span>{currentSpeaker || '—'}</span>}
        </td>
        <td>
          {canEdit ? (
            <Input
              value={currentNotes}
              aria-label={`Notes for meeting ${lesson.lessonNumber}`}
              onChange={(e) => onEdit(lesson.id, notesField, e.target.value)}
              className={`${styles.cellInput} ${styles.notesInput}`}
              placeholder={isCancelled ? 'Reason for no class' : 'Lesson notes'}
              title={currentNotes}
            />
          ) : <span className={styles.notesText}>{currentNotes || '—'}</span>}
        </td>
        {/* Actions */}
        <td className="text-center">
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
                  className="h-7 px-2 text-xs text-current"
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
