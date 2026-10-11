import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortableRow } from '@/components/curriculum/sortable-row'
import type { Lesson, LessonEdits } from '@/components/curriculum/types'

vi.mock('@/components/curriculum/schedule.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

const lesson: Lesson = {
  id: 'lesson-1', title: 'Divine Liturgy I', speaker: 'Speaker',
  scheduledDate: '2026-12-04T00:00:00.000Z', lessonNumber: 10,
  status: 'SCHEDULED', isExamDay: false, description: 'Bring your books',
  cancellationReason: 'Christmas',
  examSection: { id: 'ritual', name: 'RITUAL_THEOLOGY_SACRAMENTS', displayName: 'Ritual Theology & Sacraments' },
  resources: [], _count: { attendanceRecords: 0 },
}
const sections = [lesson.examSection, { id: 'history', name: 'CHURCH_HISTORY_COPTIC_HERITAGE', displayName: 'Church History' }]

function renderRow(overrides: { lesson?: Lesson; edits?: LessonEdits; canEdit?: boolean } = {}) {
  const onEdit = vi.fn()
  const result = render(
    <table><tbody><SortableRow
      lesson={lesson} index={0} canEdit canDrag={false} sections={sections}
      edits={undefined} onEdit={onEdit} onEditResources={vi.fn()}
      onDelete={vi.fn()} onDuplicate={vi.fn()} onResetAttendance={vi.fn()}
      onToggleExpand={vi.fn()} isExpanded={false} {...overrides}
    /></tbody></table>
  )
  return { ...result, onEdit }
}

afterEach(cleanup)

describe('Curriculum schedule', () => {
  it('shows the stored meeting number even when a filter changes the row index', () => {
    renderRow({ canEdit: false })
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Bring your books')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('edits regular lesson notes through the existing description field', () => {
    const { onEdit } = renderRow()
    fireEvent.change(screen.getByLabelText('Notes for meeting 10'), { target: { value: 'Updated notes' } })
    expect(onEdit).toHaveBeenCalledWith('lesson-1', 'description', 'Updated notes')
  })

  it.each(['CANCELLED', 'NO_CLASS'] as const)('edits %s notes through the cancellation reason without overwriting the description', status => {
    const { onEdit } = renderRow({ edits: { status } })
    expect(screen.getByLabelText('Notes for meeting 10')).toHaveValue('Christmas')
    fireEvent.change(screen.getByLabelText('Notes for meeting 10'), { target: { value: 'Holiday weekend' } })
    expect(onEdit).toHaveBeenCalledWith('lesson-1', 'cancellationReason', 'Holiday weekend')
  })

  it('uses pending block edits when displaying the selected block', () => {
    renderRow({ edits: { examSectionId: 'history' } })
    expect(screen.getByLabelText('Block for meeting 10')).toHaveValue('history')
    expect(screen.getByLabelText('Block for meeting 10')).toHaveAttribute('data-section', 'CHURCH_HISTORY_COPTIC_HERITAGE')
  })
})
