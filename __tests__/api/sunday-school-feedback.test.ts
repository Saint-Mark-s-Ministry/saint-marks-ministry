import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteIdea: vi.fn(),
  deleteManyVotes: vi.fn(),
  upsertVote: vi.fn(),
  loadFeedbackIdeaForViewer: vi.fn(),
  serializeFeedbackIdeas: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolFeedbackIdea: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.deleteIdea,
    },
    sundaySchoolFeedbackVote: {
      deleteMany: mocks.deleteManyVotes,
      upsert: mocks.upsertVote,
    },
  },
}))
vi.mock('@/lib/sunday-school-feedback-server', () => ({
  feedbackIdeaSelect: {},
  loadFeedbackIdeaForViewer: mocks.loadFeedbackIdeaForViewer,
  serializeFeedbackIdeas: mocks.serializeFeedbackIdeas,
}))

import { POST } from '@/app/api/sunday-school/feedback/route'
import {
  DELETE,
  PATCH,
} from '@/app/api/sunday-school/feedback/[id]/route'
import { PUT } from '@/app/api/sunday-school/feedback/[id]/vote/route'
import {
  PUT as PUT_RESPONSE,
  DELETE as DELETE_RESPONSE,
} from '@/app/api/sunday-school/feedback/[id]/response/route'

const participantAccess = {
  isAdmin: false,
  readOnly: false,
  canRead: true,
  servantClassIds: new Set<string>(),
  coordinatorClassIds: new Set<string>(),
  coordinatorAgeGroupIds: new Set<string>(),
  coordinatorLevels: new Set(),
  visibleClassIds: new Set<string>(),
}
const priestAccess = { ...participantAccess, readOnly: true, visibleClassIds: 'all' as const }
const adminAccess = { ...participantAccess, isAdmin: true, visibleClassIds: 'all' as const }
const routeContext = { params: Promise.resolve({ id: 'idea-1' }) }

describe('Sunday School feedback API permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'viewer-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue(participantAccess)
    mocks.loadFeedbackIdeaForViewer.mockResolvedValue({ id: 'idea-1' })
    mocks.serializeFeedbackIdeas.mockResolvedValue([{ id: 'idea-1' }])
    mocks.findUnique.mockResolvedValue({
      id: 'idea-1',
      type: SundaySchoolFeedbackType.IDEA,
      title: 'An idea',
      description: null,
      submittedById: 'author-1',
      status: SundaySchoolFeedbackStatus.OPEN,
    })
  })

  it('allows a PRIEST to submit an idea', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getSundaySchoolAccess.mockResolvedValue(priestAccess)
    mocks.create.mockResolvedValue({ id: 'idea-1' })

    const response = await POST(new Request('http://localhost/api/sunday-school/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: SundaySchoolFeedbackType.PROBLEM,
        title: 'A useful problem report',
        description: '',
      }),
    }))

    expect(response.status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ submittedById: 'priest-1' }),
    }))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: SundaySchoolFeedbackType.PROBLEM }),
    }))
  })

  it('rejects an unassigned user before creating an idea', async () => {
    mocks.getSundaySchoolAccess.mockResolvedValue({ ...participantAccess, canRead: false })

    const response = await POST(new Request('http://localhost/api/sunday-school/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A useful idea' }),
    }))

    expect(response.status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('allows a PRIEST to upsert a vote', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getSundaySchoolAccess.mockResolvedValue(priestAccess)

    const response = await PUT(new Request('http://localhost/idea-1/vote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: SundaySchoolFeedbackVoteType.UP }),
    }), routeContext)

    expect(response.status).toBe(200)
    expect(mocks.upsertVote).toHaveBeenCalledWith(expect.objectContaining({
      where: { ideaId_userId: { ideaId: 'idea-1', userId: 'priest-1' } },
      update: { vote: SundaySchoolFeedbackVoteType.UP },
    }))
  })

  it('clears a vote idempotently with deleteMany', async () => {
    const response = await PUT(new Request('http://localhost/idea-1/vote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: null }),
    }), routeContext)

    expect(response.status).toBe(200)
    expect(mocks.deleteManyVotes).toHaveBeenCalledWith({
      where: { ideaId: 'idea-1', userId: 'viewer-1' },
    })
  })

  it('rejects self-voting and voting on resolved ideas', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      submittedById: 'viewer-1',
      status: SundaySchoolFeedbackStatus.OPEN,
    })
    const selfVote = await PUT(new Request('http://localhost/idea-1/vote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: SundaySchoolFeedbackVoteType.DOWN }),
    }), routeContext)
    expect(selfVote.status).toBe(403)

    mocks.findUnique.mockResolvedValueOnce({
      submittedById: 'author-1',
      status: SundaySchoolFeedbackStatus.COMPLETED,
    })
    const resolvedVote = await PUT(new Request('http://localhost/idea-1/vote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: SundaySchoolFeedbackVoteType.UP }),
    }), routeContext)
    expect(resolvedVote.status).toBe(409)
    expect(mocks.upsertVote).not.toHaveBeenCalled()
  })

  it('allows only SUPER_ADMIN to change status', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getSundaySchoolAccess.mockResolvedValue(priestAccess)
    const priestResponse = await PATCH(new Request('http://localhost/idea-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: SundaySchoolFeedbackStatus.PLANNED }),
    }), routeContext)
    expect(priestResponse.status).toBe(403)

    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.getSundaySchoolAccess.mockResolvedValue(adminAccess)
    const adminResponse = await PATCH(new Request('http://localhost/idea-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: SundaySchoolFeedbackStatus.PLANNED }),
    }), routeContext)
    expect(adminResponse.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: SundaySchoolFeedbackStatus.PLANNED },
    }))
  })

  it('allows only SUPER_ADMIN to publish a Development Team response', async () => {
    const makeRequest = (response: unknown) => new Request('http://localhost/idea-1/response', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    expect((await PUT_RESPONSE(makeRequest('Thanks for the idea'), routeContext)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()

    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.getSundaySchoolAccess.mockResolvedValue(adminAccess)
    expect((await PUT_RESPONSE(makeRequest('   '), routeContext)).status).toBe(400)
    expect((await PUT_RESPONSE(makeRequest('x'.repeat(2001)), routeContext)).status).toBe(400)
    expect((await PUT_RESPONSE(makeRequest('Thanks for the idea'), routeContext)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        teamResponse: 'Thanks for the idea',
        teamRespondedById: 'admin-1',
        teamRespondedAt: expect.any(Date),
      }),
    }))
  })

  it('lets only SUPER_ADMIN remove a team response', async () => {
    const request = new Request('http://localhost/idea-1/response', { method: 'DELETE' })
    expect((await DELETE_RESPONSE(request, routeContext)).status).toBe(403)
    mocks.getSundaySchoolAccess.mockResolvedValue(adminAccess)
    expect((await DELETE_RESPONSE(request, routeContext)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        teamResponse: null,
        teamRespondedAt: null,
        teamRespondedById: null,
      },
    }))
  })

  it('allows the author to edit/delete an open idea but not a planned idea', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'author-1', role: 'SERVANT' })

    const editResponse = await PATCH(new Request('http://localhost/idea-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated idea', description: 'More context' }),
    }), routeContext)
    expect(editResponse.status).toBe(200)
    expect(mocks.update).toHaveBeenCalled()

    const deleteResponse = await DELETE(new Request('http://localhost/idea-1', {
      method: 'DELETE',
    }), routeContext)
    expect(deleteResponse.status).toBe(200)
    expect(mocks.deleteIdea).toHaveBeenCalledWith({ where: { id: 'idea-1' } })

    mocks.findUnique.mockResolvedValueOnce({
      submittedById: 'author-1',
      status: SundaySchoolFeedbackStatus.PLANNED,
    })
    const plannedDelete = await DELETE(new Request('http://localhost/idea-1', {
      method: 'DELETE',
    }), routeContext)
    expect(plannedDelete.status).toBe(409)
  })
})
