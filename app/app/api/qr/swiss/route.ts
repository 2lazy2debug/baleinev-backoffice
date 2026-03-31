import { NextResponse } from "next/server";

import { buildSwissQrSvg } from "@/lib/swiss-qr-image";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = searchParams.get("payload") ?? "";

  if (!payload.trim()) {
    return NextResponse.json({ error: "Missing payload." }, { status: 400 });
  }

  const svg = await buildSwissQrSvg(payload);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
