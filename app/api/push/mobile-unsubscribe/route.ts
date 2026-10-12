import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/push/mobile-unsubscribe - Remove this device's Expo push token.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { token } = body

    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    await prisma.mobilePushToken.deleteMany({
      where: { userId: user.id, token },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Mobile push unsubscribe error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unsubscribe' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
