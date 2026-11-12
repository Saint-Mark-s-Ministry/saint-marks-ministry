import { z } from 'zod'

/** Partial writes preserve omitted fields; unmarking clears the old church name. */
export const otherChurchFields = z.object({
  attendsOtherChurch: z.boolean().optional(),
  otherChurchName: z.string().trim().max(200).nullable().optional(),
}).transform(({ attendsOtherChurch, otherChurchName }) => ({
  ...(attendsOtherChurch !== undefined ? { attendsOtherChurch } : {}),
  ...(attendsOtherChurch === false
    ? { otherChurchName: null }
    : otherChurchName !== undefined
      ? { otherChurchName: otherChurchName || null, ...(otherChurchName ? { attendsOtherChurch: true } : {}) }
      : {}),
}))
