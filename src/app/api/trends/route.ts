import { NextRequest } from "next/server";
import { getSnapshots } from "@/lib/db";
import type { TrendSnapshot, TrendsResponse } from "@/types/trends";

const VALID_DAYS = new Set([7, 30, 90]);

export async function GET(request: NextRequest) {
  try {
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (isNaN(days) || !VALID_DAYS.has(days)) {
      return Response.json(
        { error: "Invalid days parameter. Must be 7, 30, or 90." },
        { status: 400 }
      );
    }

    const rows = getSnapshots(days);
    const snapshots: TrendSnapshot[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      score: row.score,
      band: row.band as TrendSnapshot["band"],
      deductions: JSON.parse(row.deductions),
    }));

    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const response: TrendsResponse = {
      snapshots,
      dateRange: {
        days,
        from: from.toISOString(),
        to: now.toISOString(),
      },
    };

    return Response.json({ data: response, cached: false, fetchedAt: now.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trends";
    return Response.json({ error: message }, { status: 500 });
  }
}
