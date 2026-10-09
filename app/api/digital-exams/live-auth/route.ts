import { NextResponse } from 'next/server'
import { examAccess, examApiError } from '@/lib/digital-exam-service'
import { examPusher } from '@/lib/exam-realtime'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const { staff } = await examAccess()
    if (!staff) throw new Error('Forbidden')
    const body = await request.formData()
    const channel = body.get('channel_name'); const socket = body.get('socket_id')
    if (typeof channel !== 'string' || !/^private-digital-exam-[a-zA-Z0-9_-]+$/.test(channel) || typeof socket !== 'string' || !/^\d+\.\d+$/.test(socket)) return NextResponse.json({ error: 'Invalid live channel.' }, { status: 400 })
    const examId = channel.slice('private-digital-exam-'.length)
    if (!await prisma.digitalExamSheet.findUnique({ where: { examId }, select: { examId: true } })) throw new Error('Not found')
    const pusher = examPusher()
    if (!pusher) return NextResponse.json({ error: 'Live alerts are not configured. Refresh monitoring is available.' }, { status: 503 })
    return NextResponse.json(pusher.authorizeChannel(socket, channel))
  } catch (error) { return examApiError(error) }
}
