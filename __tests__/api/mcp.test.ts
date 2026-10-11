import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateMcpToken: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  setFeedbackStatus: vi.fn(),
  setFeedbackTeamResponse: vi.fn(),
  clearFeedbackTeamResponse: vi.fn(),
  deleteFeedbackIdea: vi.fn(),
  loadFeedbackIdeaForViewer: vi.fn(),
  serializeFeedbackIdeas: vi.fn(),
}))

vi.mock('@/lib/mcp-tokens', () => ({ authenticateMcpToken: mocks.authenticateMcpToken }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolFeedbackIdea: { findUnique: mocks.findUnique, findMany: mocks.findMany },
  },
}))
vi.mock('@/lib/sunday-school-feedback-ops', () => ({
  setFeedbackStatus: mocks.setFeedbackStatus,
  setFeedbackTeamResponse: mocks.setFeedbackTeamResponse,
  clearFeedbackTeamResponse: mocks.clearFeedbackTeamResponse,
  deleteFeedbackIdea: mocks.deleteFeedbackIdea,
}))
vi.mock('@/lib/sunday-school-feedback-server', () => ({
  feedbackIdeaSelect: {},
  loadFeedbackIdeaForViewer: mocks.loadFeedbackIdeaForViewer,
  serializeFeedbackIdeas: mocks.serializeFeedbackIdeas,
}))

import { DELETE, GET, POST } from '@/app/api/mcp/route'

const context = {
  tokenId: 't1',
  user: { id: 'admin-1', role: 'SUPER_ADMIN', name: 'Admin' },
  access: { isAdmin: true },
}

function rpc(body: unknown) {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer smk_mcp_x',
    },
    body: JSON.stringify(body),
  })
}

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await POST(
    rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  )
  const json = await response.json()
  return json.result as { isError?: boolean; content: { text: string }[] }
}

describe('/api/mcp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateMcpToken.mockResolvedValue({ ok: true, context })
    mocks.findUnique.mockResolvedValue({ id: 'idea-1' })
    mocks.loadFeedbackIdeaForViewer.mockResolvedValue({ id: 'idea-1', status: 'PLANNED' })
  })

  it('returns 401 with a challenge when unauthenticated', async () => {
    mocks.authenticateMcpToken.mockResolvedValue({ ok: false, status: 401, error: 'nope' })
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('returns 403 when the token owner lost admin rights', async () => {
    mocks.authenticateMcpToken.mockResolvedValue({ ok: false, status: 403, error: 'demoted' })
    expect((await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).status).toBe(403)
  })

  it('does not support GET or DELETE (stateless)', () => {
    expect(GET().status).toBe(405)
    expect(DELETE().status).toBe(405)
  })

  it('lists the six feedback tools', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    const json = await response.json()
    expect(json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'clear_feedback_reply',
      'delete_feedback',
      'get_feedback',
      'list_feedback',
      'reply_to_feedback',
      'set_feedback_status',
    ])
  })

  it('replies as the token owner', async () => {
    const result = await callTool('reply_to_feedback', { id: 'idea-1', response: '  Shipped!  ' })
    expect(result.isError).toBeUndefined()
    expect(mocks.setFeedbackTeamResponse).toHaveBeenCalledWith('idea-1', 'Shipped!', 'admin-1')
  })

  it.each([[''], ['   '], ['x'.repeat(2001)]])('rejects invalid reply %#', async response => {
    const result = await callTool('reply_to_feedback', { id: 'idea-1', response })
    expect(result.isError).toBe(true)
    expect(mocks.setFeedbackTeamResponse).not.toHaveBeenCalled()
  })

  it('changes status and rejects unknown statuses', async () => {
    await callTool('set_feedback_status', { id: 'idea-1', status: 'PLANNED' })
    expect(mocks.setFeedbackStatus).toHaveBeenCalledWith('idea-1', 'PLANNED')

    mocks.setFeedbackStatus.mockClear()
    const bad = await callTool('set_feedback_status', { id: 'idea-1', status: 'DONE' })
    expect(bad.isError).toBe(true)
    expect(mocks.setFeedbackStatus).not.toHaveBeenCalled()
  })

  it('reports unknown items without mutating', async () => {
    mocks.findUnique.mockResolvedValue(null)
    const result = await callTool('delete_feedback', { id: 'missing' })
    expect(result.isError).toBe(true)
    expect(mocks.deleteFeedbackIdea).not.toHaveBeenCalled()
  })

  it('deletes and clears replies', async () => {
    await callTool('delete_feedback', { id: 'idea-1' })
    expect(mocks.deleteFeedbackIdea).toHaveBeenCalledWith('idea-1')
    await callTool('clear_feedback_reply', { id: 'idea-1' })
    expect(mocks.clearFeedbackTeamResponse).toHaveBeenCalledWith('idea-1')
  })

  it('refuses every tool when the context cannot moderate', async () => {
    mocks.authenticateMcpToken.mockResolvedValue({
      ok: true,
      context: { ...context, access: { isAdmin: false } },
    })
    const result = await callTool('delete_feedback', { id: 'idea-1' })
    expect(result.isError).toBe(true)
    expect(mocks.deleteFeedbackIdea).not.toHaveBeenCalled()
  })
})
