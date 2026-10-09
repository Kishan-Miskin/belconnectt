import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobprovider/messages — Employer Candidate Messages Inbox ────
export async function GET(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    if (authUser.role !== "job_provider" && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only job providers can view employer messages" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);
    const cursor = searchParams.get("cursor"); // created_at ISO string

    const conditions: string[] = ["jm.to_job_provider_id = $1"];
    const params: any[] = [authUser.userId];

    if (cursor) {
      params.push(cursor);
      conditions.push(`jm.created_at < $${params.length}`);
    }

    params.push(limit + 1);
    const limitIdx = params.length;

    const sql = `
      SELECT 
        jm.id,
        jm.job_id,
        jm.application_id,
        jm.from_user_id,
        jm.from_email,
        jm.subject,
        jm.body,
        jm.read_at,
        jm.created_at,
        j.title AS job_title,
        COALESCE(c.name, jm.from_email) AS candidate_name,
        c.avatar AS candidate_avatar
      FROM job_messages jm
      LEFT JOIN jobs j ON jm.job_id = j.id
      LEFT JOIN customers c ON jm.from_user_id = c.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY jm.created_at DESC
      LIMIT $${limitIdx};
    `;

    const res = await query(sql, params);
    const hasMore = res.rows.length > limit;
    const messages = hasMore ? res.rows.slice(0, limit) : res.rows;
    const nextCursor = messages.length > 0 ? messages[messages.length - 1].created_at : null;

    // Also get unread count
    const unreadRes = await query(
      `SELECT COUNT(*)::int AS unread_count FROM job_messages WHERE to_job_provider_id = $1 AND read_at IS NULL`,
      [authUser.userId]
    );

    return NextResponse.json({
      messages,
      hasMore,
      nextCursor,
      unreadCount: unreadRes.rows[0]?.unread_count || 0,
    });
  } catch (error: any) {
    console.error("GET /api/jobprovider/messages error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to fetch messages inbox" }, { status: 500 });
  }
}

// ── PATCH /api/jobprovider/messages — Mark Message as Read ────────────────
export async function PATCH(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    if (authUser.role !== "job_provider" && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only job providers can update message read status" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const updateSql = `
      UPDATE job_messages
      SET read_at = NOW()
      WHERE id = $1 AND (to_job_provider_id = $2 OR $3 = 'admin')
      RETURNING *;
    `;

    const res = await query(updateSql, [messageId, authUser.userId, authUser.role]);

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Message not found or not owned by provider" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: res.rows[0],
    });
  } catch (error: any) {
    console.error("PATCH /api/jobprovider/messages error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}
