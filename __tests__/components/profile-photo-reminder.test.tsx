import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next-auth/react with configurable session
const mockSession = {
  data: null as Record<string, unknown> | null,
  status: 'unauthenticated' as string,
}

vi.mock('next-auth/react', () => ({
  useSession: () => mockSession,
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock sessionStorage separately so a dismissal lasts only for this browser
// session and never becomes a permanent account preference.
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

import { ProfilePhotoReminder } from '@/components/profile-photo-reminder'

describe('ProfilePhotoReminder', () => {
  beforeEach(() => {
    localStorageMock.clear()
    sessionStorageMock.clear()
    vi.clearAllMocks()
  })

  it('should not render when user is unauthenticated', () => {
    mockSession.data = null
    mockSession.status = 'unauthenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.innerHTML).toBe('')
  })

  it('should not render for non-student roles', () => {
    mockSession.data = {
      user: { id: 'admin-1', role: 'SUPER_ADMIN', profileImageUrl: null, name: 'Admin' },
    }
    mockSession.status = 'authenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.innerHTML).toBe('')
  })

  it('should not render when student has a profile photo', () => {
    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: 'https://example.com/photo.jpg', name: 'Student' },
    }
    mockSession.status = 'authenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.innerHTML).toBe('')
  })

  it('should render for students without a profile photo', () => {
    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
    }
    mockSession.status = 'authenticated'

    render(<ProfilePhotoReminder />)
    expect(screen.getByText(/add a profile photo/i)).toBeInTheDocument()
    expect(screen.getByText(/go to settings/i)).toBeInTheDocument()
  })

  it('should link to settings page', () => {
    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
    }
    mockSession.status = 'authenticated'

    render(<ProfilePhotoReminder />)
    const link = screen.getByText(/go to settings/i)
    expect(link.closest('a')).toHaveAttribute('href', '/settings')
  })

  it('should dismiss for the browser session when X is clicked', () => {
    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
    }
    mockSession.status = 'authenticated'

    render(<ProfilePhotoReminder />)
    const dismissButton = screen.getByLabelText(/dismiss reminder/i)
    fireEvent.click(dismissButton)

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith('profile-photo-reminder-dismissed:student-1', 'true')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('should stay hidden after dismissal during the same browser session', () => {
    sessionStorageMock.setItem('profile-photo-reminder-dismissed:student-1', 'true')

    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
    }
    mockSession.status = 'authenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('ignores and clears the old permanent dismissal', () => {
    localStorageMock.setItem('profile-photo-reminder-dismissed', 'true')

    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
    }
    mockSession.status = 'authenticated'

    render(<ProfilePhotoReminder />)

    expect(screen.getByText(/add a profile photo/i)).toBeInTheDocument()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('profile-photo-reminder-dismissed')
  })

  it('cannot be dismissed while an administrator is viewing as the student', () => {
    sessionStorageMock.setItem('profile-photo-reminder-dismissed:student-1', 'true')
    mockSession.data = {
      user: { id: 'student-1', role: 'STUDENT', profileImageUrl: null, name: 'Student' },
      impersonating: {
        originalId: 'admin-1',
        originalName: 'Admin',
        originalEmail: 'admin@example.com',
        expiresAt: Date.now() + 60_000,
        readOnly: true,
      },
    }
    mockSession.status = 'authenticated'

    render(<ProfilePhotoReminder />)

    expect(screen.getByText(/add a profile photo/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/dismiss reminder/i)).not.toBeInTheDocument()
  })

  it('should not render for MENTOR role without photo', () => {
    mockSession.data = {
      user: { id: 'mentor-1', role: 'MENTOR', profileImageUrl: null, name: 'Mentor' },
    }
    mockSession.status = 'authenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.innerHTML).toBe('')
  })

  it('should not render for PRIEST role', () => {
    mockSession.data = {
      user: { id: 'priest-1', role: 'PRIEST', profileImageUrl: null, name: 'Father' },
    }
    mockSession.status = 'authenticated'

    const { container } = render(<ProfilePhotoReminder />)
    expect(container.innerHTML).toBe('')
  })
})
