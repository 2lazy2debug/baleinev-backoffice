import { getSession } from "next-auth/react";

export async function goToLandingPage() {
  // Send each role straight to its landing page: DEPARTMENT and GUEST users land
  // on /events rather than loading "/" only to be bounced by the route gating.
  const session = await getSession();
  const role = session?.user?.role;
  window.location.href = role === "DEPARTMENT" || role === "GUEST" ? "/events" : "/";
}
