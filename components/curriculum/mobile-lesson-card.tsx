'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateUTC } from '@/lib/utils'
import { ExpandedEditableDetails } from './expanded-editable-details'
import type { Lesson, Section, LessonEdits } from './types'

interface MobileLessonCardProps {
  lesson: Lesson
  index: number
  totalCount: number
  canEdit: boolean
  canReorder: boolean
  isReordering: boolean
  sections: Section[]
  edits: LessonEdits | undefined
  onEdit: (id: string, field: keyof LessonEdits, value: string | boolean) => void
  onEditResources: (id: string, resources: { title: string; url: string }[]) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onResetAttendance: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  isExpanded: boolean
  onToggleExpand: (id: string) => void
}

export function MobileLessonCard({
  lesson,
  index,
  totalCount,
  canEdit,
  canReorder,
  isReordering,
  sections,
  edits,
  onEdit,
  onEditResources,
  onDelete,
  onDuplicate,
  onResetAttendance,
  onMoveUp,
  onMoveDown,
  isExpanded,
  onToggleExpand,
}: MobileLessonCardProps) {
  const isPast = new Date(lesson.scheduledDate) < new Date()
  const currentTitle = edits?.title ?? lesson.title
  const currentSpeaker = edits?.speaker ?? lesson.speaker ?? ''
  const currentSectionId = edits?.examSectionId ?? lesson.examSection.id
  const currentIsExamDay = edits?.isExamDay ?? lesson.isExamDay
  const currentStatus = (edits?.status ?? lesson.status) as Lesson['status']
  const hasAttendance = (lesson._count?.attendanceRecords || 0) > 0

  return (
    <Card className={isPast ? 'opacity-60' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-gray-500">#{lesson.lessonNumber || index + 1}</span>
              {canEdit ? (
                <select
                  value={currentStatus}
                  onChange={(e) => onEdit(lesson.id, 'status', e.target.value)}
                  className={`h-6 rounded border px-1 text-xs font-medium ${
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
              {currentIsExamDay && (
                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                  Exam Day
                </Badge>
              )}
            </div>
            {canEdit ? (
              <Input
                type="date"
                value={edits?.scheduledDate ?? lesson.scheduledDate.slice(0, 10)}
                onChange={(e) => onEdit(lesson.id, 'scheduledDate', e.target.value)}
                className="h-7 text-xs mt-0.5 w-40"
              />
            ) : (
              <div className="text-xs text-gray-500 mb-1">
                {formatDateUTC(lesson.scheduledDate, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasAttendance && (
              <Badge variant="outline" className="text-xs">{lesson._count.attendanceRecords} att.</Badge>
            )}
            {canEdit && canReorder && (
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700"
                  onClick={() => onMoveUp(lesson.id)}
                  disabled={index === 0 || isReordering}
                >
                  ▲
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700"
                  onClick={() => onMoveDown(lesson.id)}
                  disabled={index === totalCount - 1 || isReordering}
                >
                  ▼
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Topic */}
        <div>
          <label className="text-xs font-medium text-gray-500">Topic</label>
          {canEdit ? (
            <Input
              value={currentTitle}
              onChange={(e) => onEdit(lesson.id, 'title', e.target.value)}
              className="h-8 text-sm mt-0.5"
              placeholder="Topic title"
            />
          ) : (
            <p className="text-sm font-medium">{currentTitle}</p>
          )}
        </div>

        {/* Speaker */}
        <div>
          <label className="text-xs font-medium text-gray-500">Speaker</label>
          {canEdit ? (
            <Input
              value={currentSpeaker}
              onChange={(e) => onEdit(lesson.id, 'speaker', e.target.value)}
              className="h-8 text-sm mt-0.5"
              placeholder="Speaker name"
            />
          ) : (
            <p className="text-sm text-gray-600">{currentSpeaker || '—'}</p>
          )}
        </div>

        {/* Section + Exam Day */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500">Section</label>
            {canEdit ? (
              <select
                value={currentSectionId}
                onChange={(e) => onEdit(lesson.id, 'examSectionId', e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5 dark:bg-gray-800 dark:text-white dark:border-gray-600"
              >
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm"><Badge variant="outline" className="text-xs">{lesson.examSection.displayName}</Badge></p>
            )}
          </div>
          {canEdit && (
            <label className="flex items-center gap-1.5 cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={currentIsExamDay}
                onChange={(e) => onEdit(lesson.id, 'isExamDay', e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs">Exam Day</span>
            </label>
          )}
        </div>

        {/* Expand/Collapse toggle */}
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-gray-500 hover:text-gray-700 h-7"
            onClick={() => onToggleExpand(lesson.id)}
          >
            {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
          </Button>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="pt-2 border-t space-y-3">
            {canEdit ? (
              <ExpandedEditableDetails
                lesson={lesson}
                edits={edits}
                onEdit={onEdit}
                onEditResources={onEditResources}
              />
            ) : (
              <>
                {lesson.subtitle && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Subtitle</span>
                    <p className="text-sm text-gray-600">{lesson.subtitle}</p>
                  </div>
                )}
                {lesson.description && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Description</span>
                    <p className="text-sm text-gray-600">{lesson.description}</p>
                  </div>
                )}
                {lesson.cancellationReason && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Cancellation Reason</span>
                    <p className="text-sm text-gray-600">{lesson.cancellationReason}</p>
                  </div>
                )}
                {lesson.resources && lesson.resources.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Resources</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {lesson.resources.map((r, idx) => (
                        <a
                          key={idx}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {r.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {!lesson.subtitle && !lesson.description && (!lesson.resources || lesson.resources.length === 0) && (
                  <p className="text-xs text-gray-400 italic">No additional details</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions: Duplicate + Reset Attendance + Delete */}
        {canEdit && (
          <div className="pt-2 border-t flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onDuplicate(lesson.id)}
            >
              Duplicate
            </Button>
            {hasAttendance && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => onResetAttendance(lesson.id)}
              >
                Reset Attendance
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onDelete(lesson.id)}
              disabled={hasAttendance}
            >
              {hasAttendance ? 'Cannot Delete' : 'Delete'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
