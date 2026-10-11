import type { SundaySchoolFeedbackStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { feedbackIdeaSelect } from '@/lib/sunday-school-feedback-server'

/**
 * Moderator mutations on feedback ideas, shared by the session-authenticated
 * routes and the MCP server so both behave identically. Callers must have
 * already checked canModerateFeedback and validated their input
 * (validateFeedbackTeamResponse, SundaySchoolFeedbackStatus).
 */

export function setFeedbackStatus(id: string, status: SundaySchoolFeedbackStatus) {
  return prisma.sundaySchoolFeedbackIdea.update({
    where: { id },
    data: { status },
    select: feedbackIdeaSelect,
  })
}

export function setFeedbackTeamResponse(id: string, response: string, responderId: string) {
  return prisma.sundaySchoolFeedbackIdea.update({
    where: { id },
    data: {
      teamResponse: response,
      teamRespondedAt: new Date(),
      teamRespondedById: responderId,
    },
  })
}

export function clearFeedbackTeamResponse(id: string) {
  return prisma.sundaySchoolFeedbackIdea.update({
    where: { id },
    data: { teamResponse: null, teamRespondedAt: null, teamRespondedById: null },
  })
}

export function deleteFeedbackIdea(id: string) {
  return prisma.sundaySchoolFeedbackIdea.delete({ where: { id } })
}
