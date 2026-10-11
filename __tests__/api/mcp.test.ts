import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateMcpToken: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  queryRecords: vi.fn(),
  countRecords: vi.fn(),
  health: vi.fn(),
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
    user: { findMany: mocks.queryRecords, count: mocks.countRecords },
    $queryRaw: mocks.health,
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

  it('lists feedback and application inspection tools', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    const json = await response.json()
    expect(json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'clear_feedback_reply',
      'count_app_records',
      'delete_feedback',
      'get_app_health',
      'get_feedback',
      'list_app_entities',
      'list_feedback',
      'query_app_records',
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
  it('discovers approved fields and enum values without querying private data', async () => {
    const result = await callTool('list_app_entities', { entity: 'User' })
    const catalog = JSON.parse(result.content[0].text)
    expect(catalog[0].fields.map((field: { name: string }) => field.name)).toContain('role')
    expect(catalog[0].fields.map((field: { name: string }) => field.name)).not.toContain('password')
    expect(catalog[0].fields.find((field: { name: string }) => field.name === 'role').values).toContain('SUPER_ADMIN')
    expect(mocks.queryRecords).not.toHaveBeenCalled()
  })

  it('queries selected fields with filters and stable bounded pagination', async () => {
    mocks.queryRecords.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])
    const result = await callTool('query_app_records', {
      entity: 'User', fields: ['id'], limit: 2, offset: 10, orderBy: 'name',
      filters: [{ field: 'role', value: 'STUDENT' }],
    })
    expect(JSON.parse(result.content[0].text)).toEqual({
      entity: 'User', records: [{ id: 'u1' }, { id: 'u2' }], returned: 2, nextOffset: 12,
    })
    expect(mocks.queryRecords).toHaveBeenCalledWith({
      where: { AND: [{ role: { equals: 'STUDENT' } }] }, select: { id: true },
      skip: 10, take: 3, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
  })

  it.each([
    { entity: 'Account' },
    { entity: 'SundaySchoolPriestNote' },
    { entity: '__proto__' },
    { entity: 'User', fields: ['password'] },
    { entity: 'User', fields: ['roleAssignments'] },
    { entity: 'SundaySchoolChild', fields: ['guardianPhone'] },
    { entity: 'DigitalExamSheet', fields: ['answerKey'] },
    { entity: 'User', filters: [{ field: 'password', value: 'guess' }] },
    { entity: 'User', orderBy: 'password' },
    { entity: 'User', limit: 101 },
    { entity: 'User', offset: -1 },
    { entity: 'User', filters: [{ field: 'role', value: 'UNKNOWN' }] },
    { entity: 'User', filters: [{ field: 'isDisabled', operator: 'contains', value: true }] },
  ])('rejects unsafe or invalid inspections %#', async args => {
    expect((await callTool('query_app_records', args)).isError).toBe(true)
    expect(mocks.queryRecords).not.toHaveBeenCalled()
  })

  it('counts matching records and sanitizes database failures', async () => {
    mocks.countRecords.mockResolvedValue(12)
    const result = await callTool('count_app_records', { entity: 'User' })
    expect(JSON.parse(result.content[0].text)).toEqual({ entity: 'User', count: 12 })
    mocks.countRecords.mockRejectedValue(new Error('postgres://private-password'))
    const failed = await callTool('count_app_records', { entity: 'User' })
    expect(failed.isError).toBe(true)
    expect(failed.content[0].text).not.toContain('private-password')
  })

  it('checks database health without returning secret values', async () => {
    mocks.health.mockRejectedValue(new Error('private connection string'))
    const result = await callTool('get_app_health', {})
    expect(JSON.parse(result.content[0].text)).toMatchObject({ database: 'error' })
    expect(result.content[0].text).not.toContain('private connection string')
  })

  it.each(['list_app_entities', 'query_app_records', 'count_app_records', 'get_app_health'])('denies %s to non-admin contexts', async name => {
    mocks.authenticateMcpToken.mockResolvedValue({ ok: true, context: { ...context, user: { ...context.user, role: 'SERVANT_PREP' } } })
    const result = await callTool(name, name.includes('records') ? { entity: 'User' } : {})
    expect(result.isError).toBe(true)
    expect(mocks.queryRecords).not.toHaveBeenCalled()
    expect(mocks.countRecords).not.toHaveBeenCalled()
    expect(mocks.health).not.toHaveBeenCalled()
  })

})
