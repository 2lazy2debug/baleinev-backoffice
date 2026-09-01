import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_RESULTS = 8;

/**
 * Postal-code ↔ locality proposals for the address fields.
 *
 * `?postalCode=` answers with the localities that share that code, `?name=`
 * with the codes that share that locality. Either way the answer is a list of
 * pairs, so whichever field asked can fill the other one in.
 *
 * Proposals only: nothing here is ever imposed on what gets saved, so an
 * address in a country this table knows nothing about is still writable.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const country = (url.searchParams.get("country") || "CH").toUpperCase();
  const postalCode = url.searchParams.get("postalCode")?.trim() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";

  if (!postalCode && !name) {
    return NextResponse.json({ cities: [] });
  }

  const cities = await prisma.city.findMany({
    where: {
      country,
      ...(postalCode ? { postalCode: { startsWith: postalCode } } : {}),
      ...(name ? { name: { startsWith: name, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ postalCode: "asc" }, { name: "asc" }],
    take: MAX_RESULTS,
    select: { postalCode: true, name: true },
  });

  return NextResponse.json({ cities });
}
