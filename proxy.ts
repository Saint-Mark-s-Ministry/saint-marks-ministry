import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Paths that remain reachable while a user still has mustChangePassword=true.
// Everything else (UI pages and API routes alike) is blocked until they rotate.
const ALLOW_DURING_PASSWORD_CHANGE = [
  "/change-password",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/api/auth", // NextAuth: sign-in, sign-out, session, csrf
  "/api/auth/change-password",
]

function isAllowedDuringPasswordChange(pathname: string) {
  return ALLOW_DURING_PASSWORD_CHANGE.some(
    (allowed) => pathname === allowed || pathname.startsWith(allowed + "/")
  )
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const VIEW_AS_WRITE_ALLOWLIST = new Set([
  "/api/auth/session", // switch or stop View as mode
  "/api/auth/signout", // always let the administrator leave the session
])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // View as mode is deliberately read-only in every environment. Blocking at
  // the proxy covers API handlers and Server Actions, including routes that
  // have not yet migrated to the normalized authorization helpers.
  if (
    token?.originalId &&
    !READ_ONLY_METHODS.has(request.method) &&
    !VIEW_AS_WRITE_ALLOWLIST.has(pathname)
  ) {
    return NextResponse.json(
      {
        error: "ViewAsReadOnly",
        message: "View as mode is read-only. Stop viewing as this user before making changes.",
      },
      { status: 403 }
    )
  }

  if (isAllowedDuringPasswordChange(pathname)) {
    return NextResponse.next()
  }

  if (!token?.mustChangePassword) {
    return NextResponse.next()
  }

  // API requests should fail closed with a structured error so the client can
  // handle it; navigations should be redirected to the change-password page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "PasswordChangeRequired",
        message: "You must change your password before continuing.",
      },
      { status: 403 }
    )
  }

  const url = request.nextUrl.clone()
  url.pathname = "/change-password"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  // Skip Next internals and common static assets; everything else passes
  // through the proxy so the password-change gate is enforced uniformly.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|woff|woff2)).*)"],
}
