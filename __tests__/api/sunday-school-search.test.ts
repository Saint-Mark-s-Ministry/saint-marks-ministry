import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  visibleClassFilter: vi.fn(),
  children: vi.fn(),
  classes: vi.fn(),
  lessons: vi.fn(),
}))

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: mocks.auth }))
vi.mock("@/lib/sunday-school-access", () => ({
  getSundaySchoolAccess: mocks.access,
  visibleClassFilter: mocks.visibleClassFilter,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sundaySchoolChild: { findMany: mocks.children },
    sundaySchoolClass: { findMany: mocks.classes },
    sundaySchoolWeeklyLesson: { findMany: mocks.lessons },
  },
}))

import { GET } from "@/app/api/sunday-school/search/route"

describe("Sunday School universal search", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: "servant-1", role: "SERVANT" })
    mocks.access.mockResolvedValue({ canRead: true })
    mocks.visibleClassFilter.mockReturnValue(["class-1"])
    mocks.children.mockResolvedValue([])
    mocks.classes.mockResolvedValue([])
    mocks.lessons.mockResolvedValue([])
  })

  it("rejects accounts without Sunday School access", async () => {
    mocks.access.mockResolvedValue({ canRead: false })
    const response = await GET(new Request("http://localhost/api/sunday-school/search?q=jo"))
    expect(response.status).toBe(403)
    expect(mocks.children).not.toHaveBeenCalled()
  })

  it("requires two search characters", async () => {
    const response = await GET(new Request("http://localhost/api/sunday-school/search?q=j"))
    expect(response.status).toBe(400)
    expect(mocks.children).not.toHaveBeenCalled()
  })

  it("applies the viewer's class scope to every record type", async () => {
    await GET(new Request("http://localhost/api/sunday-school/search?q=Good%20Samaritan"))

    expect(mocks.children).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: ["class-1"] }, isActive: true }),
    }))
    expect(mocks.classes).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["class-1"] }, isActive: true }),
    }))
    expect(mocks.lessons).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: ["class-1"] } }),
    }))
  })

  it("returns summary fields without guardian or family contact data", async () => {
    mocks.children.mockResolvedValue([{
      id: "child-1",
      firstName: "Jo",
      lastName: "Smith",
      classId: "class-1",
      level: "GRADE_3",
      class: { name: "Third Grade" },
      guardianPhone: "should-not-be-selected",
    }])
    mocks.classes.mockResolvedValue([{
      id: "class-1",
      name: "Third Grade",
      level: "GRADE_3",
      _count: { children: 1 },
    }])
    mocks.lessons.mockResolvedValue([{
      id: "lesson-1",
      classId: "class-1",
      sundayDate: new Date("2026-09-27T00:00:00.000Z"),
      title: "Good Samaritan",
      class: { name: "Third Grade", level: "GRADE_3" },
    }])

    const response = await GET(new Request("http://localhost/api/sunday-school/search?q=Jo"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.children[0]).toEqual({
      kind: "child",
      id: "child-1",
      title: "Jo Smith",
      subtitle: "Third Grade · 3rd Grade",
      classId: "class-1",
    })
    expect(JSON.stringify(body)).not.toContain("guardian")
    expect(body.lessons[0].sundayDate).toBe("2026-09-27T00:00:00.000Z")
  })

  it("recognizes grade labels and readable dates", async () => {
    await GET(new Request("http://localhost/api/sunday-school/search?q=3rd%20grade"))
    expect(mocks.classes).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ level: { in: ["GRADE_3"] } }]),
      }),
    }))

    await GET(new Request("http://localhost/api/sunday-school/search?q=September%2027,%202026"))
    expect(mocks.lessons).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ sundayDate: new Date("2026-09-27T00:00:00.000Z") }]),
      }),
    }))
  })
})
