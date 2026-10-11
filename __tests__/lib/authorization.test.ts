import { describe, expect, it } from "vitest"
import {
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

  it("denies a priest even when other roles could allow the action", () => {
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
