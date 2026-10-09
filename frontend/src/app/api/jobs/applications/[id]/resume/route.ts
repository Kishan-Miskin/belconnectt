import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import fs from "fs";
import path from "path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const applicationId = resolvedParams.id;

    if (!applicationId) {
      return NextResponse.json({ error: "Application ID is required" }, { status: 400 });
    }

    // Authorization & ownership check
    const sql = `
      SELECT 
        ja.id,
        ja.candidate_id,
        ja.resume_path,
        ja.resume_url,
        ja.resume_filename,
        ja.resume_mime,
        j.job_provider_id
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.id = $1
      LIMIT 1;
    `;

    const res = await query(sql, [applicationId]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const app = res.rows[0];

    const isCandidateOwner = app.candidate_id === authUser.userId;
    const isEmployerOwner = app.job_provider_id === authUser.userId;
    const isAdmin = authUser.role === "admin";

    if (!isCandidateOwner && !isEmployerOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view or download this resume" },
        { status: 403 }
      );
    }

    const targetUrl = app.resume_path || app.resume_url;
    if (!targetUrl) {
      return NextResponse.json({ error: "No resume on file for this application" }, { status: 404 });
    }

    const filename = app.resume_filename || `resume-${applicationId}.pdf`;
    const mime = app.resume_mime || "application/pdf";

    // 1. Remote Vercel Blob URL handling
    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
      const blobResponse = await fetch(targetUrl);
      if (!blobResponse.ok) {
        return NextResponse.json({ error: "Failed to retrieve resume file from cloud storage" }, { status: 502 });
      }

      const blobData = await blobResponse.arrayBuffer();
      return new NextResponse(blobData, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    // 2. Local Filesystem path handling (/uploads/job-resumes/...)
    const relativePath = targetUrl.startsWith("/") ? targetUrl.slice(1) : targetUrl;
    const fullPath = path.join(process.cwd(), "public", relativePath);

    if (fs.existsSync(fullPath)) {
      const fileBuffer = await fs.promises.readFile(fullPath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    return NextResponse.json({ error: "Resume file not found on local storage" }, { status: 404 });
  } catch (error: any) {
    console.error("GET /api/jobs/applications/[id]/resume error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to download resume" }, { status: 500 });
  }
}
