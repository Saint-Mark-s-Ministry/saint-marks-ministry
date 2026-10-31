// Mirrors lib/contact-book.ts (GET /api/contact-book). Type-only: no server code reaches native bundles.

/** A Sunday School serving assignment, as summarized for the directory. */
export interface ContactBookServing {
  id: string;
  authority: "SERVANT" | "COORDINATOR";
  classId: string | null;
  ageGroupId: string | null;
  class: { id: string; name: string; level: string } | null;
  ageGroup: { id: string; name: string; levels: string[] } | null;
}

export interface ContactBookEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profileImageUrl?: string | null;
  /** Ministry roles, e.g. "SUNDAY_SCHOOL_SERVANT". Not application access. */
  roles?: string[];
  sundaySchoolServing?: ContactBookServing[];
}

/** The whole directory in one response. Older servers also sent page and pageSize. */
export interface ContactBookResponse {
  contacts: ContactBookEntry[];
  total: number;
  page?: number;
  pageSize?: number;
}
