import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { ContactBook } from '@/components/contact-book'
import { authOptions } from '@/lib/auth'
import { AuthorizationError, getAuthorizationContext } from '@/lib/authorization'
import { canReadContactBook } from '@/lib/contact-book'

export default async function ContactBookPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.mustChangePassword) redirect('/change-password')

  try {
    const context = await getAuthorizationContext(session.user.id)
    if (!canReadContactBook(context)) redirect('/dashboard')
  } catch (error) {
    if (error instanceof AuthorizationError) redirect('/login')
    throw error
  }

  return <ContactBook />
}
