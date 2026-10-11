import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/push/mobile-subscribe - Register this device's Expo push token.
// A distinct transport from /api/push/subscribe (browser Web Push); see
// MobilePushToken in prisma/schema.prisma.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { token, platform } = body

    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
    }
    if (platform !== 'ios' && platform !== 'android') {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    const subscription = await prisma.mobilePushToken.upsert({
      where: { userId_token: { userId: user.id, token } },
      update: { platform },
      create: { userId: user.id, token, platform },
    })

    return NextResponse.json({ id: subscription.id, success: true })
  } catch (error: unknown) {
    console.error('Mobile push subscribe error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to subscribe' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
