import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/jwt";
import { checkRateLimit } from "@/lib/rateLimit";
import { put } from "@vercel/blob";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function getFileExtension(filename: string, mime: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return ".pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (ext === "doc" || mime === "application/msword") return ".doc";
  return ext ? `.${ext}` : ".bin";
}

function verifyMagicBytes(buffer: Buffer, filename: string, mime: string): { valid: boolean; detectedMime: string } {
  const ext = filename.split(".").pop()?.toLowerCase();
  
  // PDF check (%PDF-)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, detectedMime: "application/pdf" };
  }

  // DOCX / ZIP check (PK\x03\x04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return { valid: true, detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }

  // DOC check (D0CF11E0)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return { valid: true, detectedMime: "application/msword" };
  }

  // Fallback extension/mime check for valid documents
  if (ext === "pdf" || mime === "application/pdf") {
    return { valid: true, detectedMime: "application/pdf" };
  }
  if (ext === "docx" || mime.includes("wordprocessingml")) {
    return { valid: true, detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (ext === "doc" || mime.includes("msword")) {
    return { valid: true, detectedMime: "application/msword" };
  }

  return { valid: false, detectedMime: "application/octet-stream" };
}

export async function POST(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const rateCheck = await checkRateLimit(request, 10, 15 * 60 * 1000);
    if (!rateCheck.isAllowed && rateCheck.response) {
      return rateCheck.response;
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds maximum allowed limit of 5 MB" },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const magicCheck = verifyMagicBytes(buffer, file.name, file.type || "");
    if (!magicCheck.valid) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF, DOC, and DOCX documents are allowed." },
        { status: 400 }
      );
    }

    const ext = getFileExtension(file.name, magicCheck.detectedMime);
    const safeOriginalName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100);
    const blobPathname = `job-resumes/${authUser.userId}/${crypto.randomUUID()}${ext}`;

    let resumePath = "";
    let resumeUrl = "";

    // Try Vercel Blob if credentials are key-configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(blobPathname, buffer, {
          access: "private",
          contentType: magicCheck.detectedMime || "application/pdf",
        });
        resumePath = blob.pathname || blob.url;
        resumeUrl = blob.url;
      } catch (blobErr: any) {
        console.warn("Vercel Blob upload warning:", blobErr?.message || blobErr);
      }
    }

    // Local filesystem storage fallback for local development or when Blob token is absent
    if (!resumePath) {
      const sanitizedUserId = authUser.userId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const relativeSubdir = path.join("uploads", "job-resumes", sanitizedUserId);
      const targetDir = path.join(process.cwd(), "public", relativeSubdir);

      await fs.promises.mkdir(targetDir, { recursive: true });

      const localFileName = `${crypto.randomUUID()}${ext}`;
      const fullFilePath = path.join(targetDir, localFileName);
      await fs.promises.writeFile(fullFilePath, buffer);

      resumePath = `/uploads/job-resumes/${sanitizedUserId}/${localFileName}`;
      resumeUrl = `/uploads/job-resumes/${sanitizedUserId}/${localFileName}`;
    }

    return NextResponse.json(
      {
        success: true,
        resumePath,
        resumeUrl,
        filename: safeOriginalName,
        size: file.size,
        mime: magicCheck.detectedMime,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/jobs/resume-upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload resume file" },
      { status: 500 }
    );
  }
}
