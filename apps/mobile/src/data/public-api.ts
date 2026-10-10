/**
 * A thin transport for the handful of real, unauthenticated public
 * endpoints this app's web pages already use (parent/servant sign-up, the
 * Servants Prep invite-code registration flow) — no session, no cookie
 * jar, since none of these routes need or accept one.
 */

import { fetch } from "expo/fetch";
import { apiOrigin } from "./auth-provider";

const OFFLINE_MESSAGE = "Could not reach the server. Check your connection and try again.";

export class PublicApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiOrigin) throw new Error("The portal is not configured.");
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${apiOrigin}${path}`, init);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PublicApiError(
      (body?.error as string | undefined) ?? (body?.message as string | undefined) ?? "Request failed. Please try again.",
      response.status,
    );
  }
  return body as T;
}

export function publicJson(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Uploads a locally-picked file (image or document) as multipart/form-data, matching the real web upload routes exactly. */
export async function publicUpload<T>(
  path: string,
  file: { uri: string; name: string },
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const picked = await fetch(file.uri);
  const blob = await picked.blob();
  const form = new FormData();
  // React Native's FormData accepts a 3rd filename arg via this overload,
  // same as this app's existing prep-application.tsx upload.
  (form as unknown as { append: (key: string, value: Blob, name?: string) => void }).append("file", blob, file.name);
  return publicRequest<T>(path, { method: "POST", body: form, headers: extraHeaders });
}
