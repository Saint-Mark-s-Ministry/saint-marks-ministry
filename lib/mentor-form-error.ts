import { Prisma } from '@prisma/client'

export class MentorFormConflictError extends Error {
  constructor() { super('Mentor form changed. Refresh the form before saving again.'); this.name = 'MentorFormConflictError' }
}
export function isMentorFormConflict(error: unknown) {
  return error instanceof MentorFormConflictError || (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034'))
}
