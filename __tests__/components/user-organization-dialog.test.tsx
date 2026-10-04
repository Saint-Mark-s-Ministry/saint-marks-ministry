import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SundaySchoolOrganization } from '@/lib/sunday-school-organization'

const priest = { id: 'priest-1', name: 'Fr. Isaac', profileImageUrl: null }
const coordinator = { id: 'band-lead', name: 'Ehab Hanna', profileImageUrl: null }
const servant = { id: 'servant-1', name: 'Aba Servant', profileImageUrl: null }

const organization: SundaySchoolOrganization = {
  academicYear: { id: 'year-1', name: '2025-2026' },
  priests: [priest],
  ageGroups: [{
    id: 'middle-school',
    name: 'Middle School',
    levels: ['GRADE_6', 'GRADE_7'],
    overseerId: priest.id,
  }],
  classes: [
    { id: 'sixth', name: '6th Grade', level: 'GRADE_6' },
    { id: 'seventh', name: '7th Grade', level: 'GRADE_7' },
  ],
  assignments: [
    { user: coordinator, authority: 'COORDINATOR', classId: null, ageGroupId: 'middle-school' },
    { user: servant, authority: 'SERVANT', classId: 'sixth', ageGroupId: null },
  ],
}

vi.mock('@/lib/swr', () => ({
  useSundaySchoolOrganization: () => ({
    data: organization,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}))

import { UserOrganizationDialog } from '@/components/user-organization-dialog'

describe('UserOrganizationDialog', () => {
  it('shows the priest and age-group coordinator once before classes branch out', () => {
    render(<UserOrganizationDialog user={priest} onClose={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /View Fr\. Isaac's organization/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /View Ehab Hanna's organization/ })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '6th Grade' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '7th Grade' })).toBeInTheDocument()
    expect(screen.getByLabelText('Middle School classes')).toHaveClass('grid-cols-1')
    expect(screen.getByLabelText('Middle School classes')).not.toHaveClass('overflow-x-auto')
  })

  it('keeps a servant view focused on only that servant’s class', () => {
    render(<UserOrganizationDialog user={servant} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '6th Grade' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '7th Grade' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View Fr\. Isaac's organization/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View Ehab Hanna's organization/ })).toBeInTheDocument()
  })
})
