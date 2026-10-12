// Mirrors lib/contact-book.ts (GET /api/contact-book). Type-only: no server code reaches native bundles.

export interface ContactBookEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface ContactBookResponse {
  contacts: ContactBookEntry[];
  total: number;
  page: number;
  pageSize: number;
}
