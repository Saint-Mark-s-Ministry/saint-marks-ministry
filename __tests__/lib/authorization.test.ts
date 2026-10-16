import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoleTag } from "@prisma/client"
import {
  getAuthorizationContext,
  ALL_SCOPE,
  NO_SCOPE,
  assertCanWriteBusinessData,
  canWriteBusinessData,
  idScope,
  scopeAllows,
  scopeIdWhere,
  type AuthorizationContext,
} from "@/lib/authorization"

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: "user-1",
    disabled: false,
    canAccessContactBook: false,
    roleTags: new Set(),
    readOnly: false,
    sundaySchoolYearId: null,
    prepStudentScope: NO_SCOPE,
    sundaySchoolClassScope: NO_SCOPE,
    guardianChildScope: NO_SCOPE,
    ownSundaySchoolChildId: null,
    ...overrides,
  }
}

describe("authorization scopes", () => {
  it("represents no access with an explicit empty IN clause", () => {
    expect(scopeIdWhere(NO_SCOPE)).toEqual({ id: { in: [] } })
    expect(scopeAllows(NO_SCOPE, "class-1")).toBe(false)
  })

  it("represents unrestricted access without an undefined sentinel", () => {
    expect(scopeIdWhere(ALL_SCOPE)).toEqual({})
    expect(scopeAllows(ALL_SCOPE, "class-1")).toBe(true)
  })

  it("deduplicates explicit resource IDs", () => {
    const scope = idScope(["class-1", "class-1", "class-2"])
    expect(scopeIdWhere(scope)).toEqual({ id: { in: ["class-1", "class-2"] } })
    expect(scopeAllows(scope, "class-2")).toBe(true)
    expect(scopeAllows(scope, "class-3")).toBe(false)
  })

  it("collapses an empty ID set to no access", () => {
    expect(idScope([])).toBe(NO_SCOPE)
  })
})

describe("write denial", () => {
  it("allows an active non-priest principal", () => {
    expect(canWriteBusinessData(context())).toBe(true)
  })

  it("denies an explicitly read-only context", () => {
    const priest = context({ readOnly: true })
    expect(canWriteBusinessData(priest)).toBe(false)
    expect(() => assertCanWriteBusinessData(priest)).toThrow("Forbidden")
  })

  it("denies a disabled account", () => {
    const disabled = context({ disabled: true })
    expect(canWriteBusinessData(disabled)).toBe(false)
    expect(() => assertCanWriteBusinessData(disabled)).toThrow("Forbidden")
  })
})

const database = vi.hoisted(() => ({ user: vi.fn(), year: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: database.user },
  sundaySchoolYear: { findFirst: database.year },
} }))

describe("current priest authorization", () => {
  beforeEach(() => {
    database.year.mockResolvedValue(null)
    database.user.mockResolvedValue({
      id: "priest", isDisabled: false, canAccessContactBook: false,
      roleAssignments: [{ tag: RoleTag.PRIEST }], mentorAssignments: [],
      guardianOfChildren: [], linkedSundaySchoolChild: null,
    })
  })

  it("grants editing and all ministry scopes from the active priest tag without assignments", async () => {
    const access = await getAuthorizationContext("priest")
    expect(access.readOnly).toBe(false)
    expect(access.prepStudentScope).toBe(ALL_SCOPE)
    expect(access.sundaySchoolClassScope).toBe(ALL_SCOPE)
    expect(canWriteBusinessData(access)).toBe(true)
    expect(database.user).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      roleAssignments: { where: { revokedAt: null }, select: { tag: true } },
    }) }))
  })

  it("removes global scope when the priest tag is revoked", async () => {
    database.user.mockResolvedValue({
      id: "former-priest", isDisabled: false, canAccessContactBook: false,
      roleAssignments: [], mentorAssignments: [], guardianOfChildren: [], linkedSundaySchoolChild: null,
    })
    const access = await getAuthorizationContext("former-priest")
    expect(access.prepStudentScope).toBe(NO_SCOPE)
    expect(access.sundaySchoolClassScope).toBe(NO_SCOPE)
  })

  it("denies writing for a disabled priest", async () => {
    database.user.mockResolvedValue({
      id: "priest", isDisabled: true, canAccessContactBook: false,
      roleAssignments: [{ tag: RoleTag.PRIEST }], mentorAssignments: [],
      guardianOfChildren: [], linkedSundaySchoolChild: null,
    })
    expect(canWriteBusinessData(await getAuthorizationContext("priest"))).toBe(false)
  })
})
