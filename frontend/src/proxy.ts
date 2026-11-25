import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Folder routes (`/admin/billing` has `/pay` + `/done` children) often land
 * in the address bar as `/admin/billing/`. A rewrite keeps that slash and the
 * App Router then 404s on an empty child segment. Redirect to the real path.
 */
export function proxy(request: NextRequest) {
  const incoming = new URL(request.url);
  if (incoming.pathname.length > 1 && incoming.pathname.endsWith("/")) {
    incoming.pathname = incoming.pathname.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(incoming, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|storage/|.*\\..*).*)"],
};
