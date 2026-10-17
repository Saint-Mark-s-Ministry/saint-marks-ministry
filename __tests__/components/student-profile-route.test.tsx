import { Suspense } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/app/dashboard/admin/students/page', () => ({ default: () => <div>Student roster</div> }))
vi.mock('@/components/student-profile-modal', () => ({ StudentProfileModal: ({ studentId, onClose }: { studentId: string; onClose: () => void }) => (
  <div role="dialog"><p>Profile for {studentId}</p><button onClick={onClose}>Close profile</button></div>
) }))

import StudentProfileRoute from '@/app/dashboard/admin/students/[id]/page'

it('opens a shared profile URL as a modal over the roster and returns to students on close', async () => {
  const params = Promise.resolve({ id: 'nori' })
  await act(async () => { render(<Suspense><StudentProfileRoute params={params} /></Suspense>) })
  expect(screen.getByText('Student roster')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toHaveTextContent('Profile for nori')
  fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
  expect(mocks.replace).toHaveBeenCalledWith('/dashboard/admin/students')
})
