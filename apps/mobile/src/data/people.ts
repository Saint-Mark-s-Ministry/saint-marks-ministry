import type { RoleTag, UserRole } from "@stmark/contracts";
export interface Person { id: string; name: string; email: string; phone: string | null; role: UserRole; profileImageUrl?: string | null; isDisabled?: boolean; updatedAt?: string; roleAssignments: { tag: RoleTag }[]; }
export const accessTagLabels: Record<RoleTag, string> = {
  SUPER_ADMIN: "Super administrator", PRIEST: "Priest (read-only ministry records)",
  SUNDAY_SCHOOL_SERVANT: "Sunday School servant", SUNDAY_SCHOOL_STUDENT: "Sunday School student",
  PARENT: "Parent", SERVANTS_PREP_SERVANT: "Servants Prep leader", SERVANTS_PREP_STUDENT: "Servants Prep student",
};
