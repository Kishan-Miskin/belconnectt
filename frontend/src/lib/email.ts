import nodemailer from "nodemailer";

export interface SendPasswordResetOtpEmailParams {
  to: string;
  otp: string;
  expiresInMinutes?: number;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  missingVars?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTransporter: any = null;

export function getSmtpMissingVars(): string[] {
  const missing: string[] = [];
  if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!process.env.SMTP_PORT) missing.push("SMTP_PORT");
  if (!process.env.SMTP_USER) missing.push("SMTP_USER");
  if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");
  if (!process.env.SMTP_FROM_EMAIL) missing.push("SMTP_FROM_EMAIL");
  return missing;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTransporter(): any {
  if (cachedTransporter) return cachedTransporter;

  const missingVars = getSmtpMissingVars();
  if (missingVars.length > 0) {
    const errorMsg = `EMAIL_SMTP_CONFIG_MISSING: ${missingVars.join(", ")}`;
    console.error(`[EMAIL_SERVICE_ERROR] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

/**
 * Optional SMTP connection verification for dev diagnostics
 */
export async function verifySmtpConnection(): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log("[EMAIL] SMTP connection verified");
    return true;
  } catch (error: any) {
    console.error("[EMAIL_ERROR] SMTP verification failed:", error?.message || error);
    return false;
  }
}

/**
 * Helper to compute HMAC SHA-256 hash for OTP storage and verification
 */
export function hashOtpWithHmac(userId: string, otp: string): string {
  const crypto = require("crypto");
  const secret = process.env.PASSWORD_RESET_OTP_SECRET || "default_belconnect_otp_hmac_secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${otp}`)
    .digest("hex");
}

export async function sendPasswordResetOtpEmail({
  to,
  otp,
  expiresInMinutes = 10,
}: SendPasswordResetOtpEmailParams): Promise<SendEmailResult> {
  const missingVars = getSmtpMissingVars();
  if (missingVars.length > 0) {
    console.warn(`[PASSWORD_RESET_WARN] Missing SMTP config: ${missingVars.join(", ")}`);
    return {
      success: false,
      error: `EMAIL_SMTP_CONFIG_MISSING: ${missingVars.join(", ")}`,
      missingVars,
    };
  }

  try {
    const transporter = getTransporter();

    const fromEmail = process.env.SMTP_FROM_EMAIL || "no-reply@belconnect.com";
    const fromName = process.env.SMTP_FROM_NAME || "BelConnect";
    const from = `${fromName} <${fromEmail}>`;

    console.log("[PASSWORD_RESET] smtp-send-start");

    const info = await transporter.sendMail({
      from,
      to,
      subject: "BelConnect Password Reset Code",
      text: `Your BelConnect password reset code is: ${otp}\n\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not request a password reset, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #2563eb; margin: 0; font-size: 22px; font-weight: bold;">${fromName}</h2>
          </div>
          <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Reset Your Password</h3>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">You requested a password reset code for your account.</p>
          <div style="background-color: #f1f5f9; padding: 18px; text-align: center; border-radius: 10px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1e293b; margin: 24px 0;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    console.log(`[PASSWORD_RESET] smtp-send-success messageId=${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error("[PASSWORD_RESET_EMAIL_FAILED] Error sending email:", error?.message || error);
    return {
      success: false,
      error: error?.message || "Failed to send password reset email",
    };
  }
}

export interface SendJobContactEmailParams {
  to: string;
  replyTo: string;
  candidateName: string;
  jobTitle: string;
  subject: string;
  body: string;
}

/**
 * Send an email from a job candidate to the employer's contact email.
 * Includes CRLF header injection protection, HTML escaping, and Reply-To header.
 */
export async function sendJobContactEmail({
  to,
  replyTo,
  candidateName,
  jobTitle,
  subject,
  body,
}: SendJobContactEmailParams): Promise<SendEmailResult> {
  const missingVars = getSmtpMissingVars();
  if (missingVars.length > 0) {
    console.warn(`[JOB_CONTACT_WARN] Missing SMTP config: ${missingVars.join(", ")}`);
    return {
      success: false,
      error: `EMAIL_SMTP_CONFIG_MISSING: ${missingVars.join(", ")}`,
      missingVars,
    };
  }

  try {
    const transporter = getTransporter();

    // Strip CR/LF for header injection protection
    const safeTo = to.replace(/[\r\n]/g, "").trim();
    const safeReplyTo = replyTo.replace(/[\r\n]/g, "").trim();
    const safeCandidateName = candidateName.replace(/[\r\n]/g, "").trim();
    const safeJobTitle = jobTitle.replace(/[\r\n]/g, "").trim();
    const safeSubject = subject.replace(/[\r\n]/g, "").trim();

    const fromEmail = process.env.SMTP_FROM_EMAIL || "no-reply@belconnect.com";
    const fromName = process.env.SMTP_FROM_NAME || "BelConnect Jobs";
    const from = `${fromName} <${fromEmail}>`;

    const escapedBody = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br/>");

    const info = await transporter.sendMail({
      from,
      to: safeTo,
      replyTo: `${safeCandidateName} <${safeReplyTo}>`,
      subject: `[Job Inquiry: ${safeJobTitle}] ${safeSubject}`,
      text: `Inquiry regarding "${safeJobTitle}" from ${safeCandidateName} (${safeReplyTo}):\n\n${body}\n\n--- Reply to this email to contact the candidate directly. ---`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
            <h3 style="color: #1e293b; margin: 0;">New Candidate Inquiry: ${safeJobTitle}</h3>
            <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">From: <strong>${safeCandidateName}</strong> (&lt;${safeReplyTo}&gt;)</p>
          </div>
          <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            ${escapedBody}
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">You can reply directly to this email to reach <strong>${safeCandidateName}</strong>.</p>
        </div>
      `,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error("[JOB_CONTACT_EMAIL_FAILED]", error?.message || error);
    return {
      success: false,
      error: error?.message || "Failed to send job contact email",
    };
  }
}

export async function sendCandidateNotificationEmail({
  to,
  candidateName,
  jobTitle,
  subject,
  message,
}: {
  to: string;
  candidateName: string;
  jobTitle: string;
  subject: string;
  message: string;
}): Promise<SendEmailResult> {
  if (process.env.JOB_EMAILS_ENABLED !== "true") {
    return { success: false, error: "JOB_EMAILS_DISABLED" };
  }

  const missingVars = getSmtpMissingVars();
  if (missingVars.length > 0) return { success: false, missingVars };

  try {
    const transporter = getTransporter();
    const safeTo = to.replace(/[\r\n]/g, "").trim();
    const safeSubject = subject.replace(/[\r\n]/g, "").trim();
    const fromEmail = process.env.SMTP_FROM_EMAIL || "no-reply@belconnect.com";
    const from = `BelConnect Jobs <${fromEmail}>`;

    const info = await transporter.sendMail({
      from,
      to: safeTo,
      subject: `[BelConnect Jobs] ${safeSubject}`,
      text: `Hello ${candidateName},\n\nUpdate regarding your application for "${jobTitle}":\n\n${message}\n\nBest regards,\nBelConnect Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h3 style="color: #2563eb; margin-top: 0;">Application Update: ${jobTitle}</h3>
          <p style="color: #334155; font-size: 14px;">Hello ${candidateName},</p>
          <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; color: #1e293b; font-size: 14px; margin: 16px 0;">
            ${message}
          </div>
          <p style="color: #64748b; font-size: 13px;">View your application status on <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/jobs/applications">BelConnect My Applications</a>.</p>
        </div>
      `,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[CANDIDATE_NOTIFICATION_EMAIL_FAILED]", error?.message || error);
    return { success: false, error: error?.message };
  }
}

