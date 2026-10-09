import { z } from "zod";
import { NextResponse } from "next/server";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email is too long"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(100, "Password exceeds maximum length"),
});
export const googleAuthSchema = z.object({
  credential: z.string().min(10, "Google credential ID token is required"),
  accountType: z.string().optional(),
  role: z.string().optional(),
});
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255, "Email address is too long"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .max(100, "Password exceeds maximum length"),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name is too long")
    .optional(),
  phone: z
    .string()
    .trim()
    .max(50, "Phone number is too long")
    .optional(),
  role: z.enum(["user", "provider", "job_provider"]),
  avatar: z.string().url("Invalid avatar URL").optional().or(z.literal("")),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email is too long"),
});

export const verifyResetOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email is too long"),
  otp: z
    .string()
    .trim()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Verification code must be numeric"),
});

export const resetPasswordSchema = z.object({
  resetToken: z
    .string()
    .trim()
    .min(10, "Reset token is required"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .max(100, "Password exceeds maximum length"),
  confirmPassword: z
    .string()
    .min(6, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const createBookingSchema = z.object({
  serviceId: z.string().optional(),
  providerId: z.string().optional(),
  serviceName: z.string().min(1, "Service name is required"),
  category: z.string().min(1, "Category is required"),
  date: z.string().min(1, "Booking date is required"),
  time: z.string().min(1, "Booking time is required"),
  serviceAddressId: z.string().optional(),
  destinationAddress: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
});

export const createAddressSchema = z.object({
  type: z.string().min(1, "Address type is required").max(50),
  text: z.string().min(5, "Address text must be at least 5 characters"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});


/**
 * Helper function to validate request JSON body against a Zod schema.
 */
export async function parseAndValidate<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T; response?: undefined } | { data?: undefined; response: NextResponse }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const errorMessages = result.error.issues.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );
      return {
        response: NextResponse.json(
          {
            error: "Validation error",
            details: errorMessages,
          },
          { status: 400 }
        ),
      };
    }
    return { data: result.data };
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      ),
    };
  }
}

// ── Job Portal Zod Schemas ─────────────────────────────────────────

export const createJobSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200, "Title is too long"),
  category: z.string().trim().min(2, "Category is required").max(100, "Category is too long"),
  jobType: z.string().trim().max(50).optional().default("Full-time"),
  workMode: z.string().trim().max(50).optional().default("On-site"),
  location: z.string().trim().min(2, "Location is required").max(200, "Location is too long").default("Belagavi"),
  salaryType: z.string().trim().max(50).optional().default("Competitive"),
  salaryMin: z.union([z.number(), z.string()]).optional().nullable(),
  salaryMax: z.union([z.number(), z.string()]).optional().nullable(),
  salaryCurrency: z.string().trim().max(10).optional().default("INR"),
  salaryText: z.string().trim().max(100).optional().nullable(),
  openings: z.union([z.number(), z.string()]).optional().default(1),
  experienceRequired: z.string().trim().max(100).optional().nullable(),
  educationRequired: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(10000, "Description is too long"),
  responsibilities: z.string().trim().max(10000).optional().nullable(),
  requirements: z.string().trim().max(10000).optional().nullable(),
  perksBenefits: z.string().trim().max(5000).optional().nullable(),
  deadline: z.string().trim().max(50).optional().nullable(),
  status: z.enum(["draft", "active", "closed", "expired"]).optional().default("active"),
  contactEmail: z.string().trim().toLowerCase().email("Invalid contact email format").max(254).optional().or(z.literal("")),
});

export const updateJobSchema = createJobSchema.partial();

export const createApplicationSchema = z.object({
  candidateName: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  candidateEmail: z.string().trim().toLowerCase().email("Invalid email format").max(254),
  candidatePhone: z.string().trim().max(50).optional().nullable(),
  experience: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  coverNote: z.string().trim().max(5000).optional().nullable(),
  resumePath: z.string().trim().min(1, "Resume path is required").max(500),
  resumeFilename: z.string().trim().min(1, "Resume filename is required").max(255),
  resumeMime: z.string().trim().min(1, "Resume mime type is required").max(100),
  resumeSize: z.number().min(1).max(5242880, "Resume file size must not exceed 5 MB"),
});

export const updateCandidateStatusSchema = z.object({
  applicationId: z.string().trim().min(1, "Application ID is required"),
  status: z.enum([
    "new",
    "reviewed",
    "shortlisted",
    "assessment_sent",
    "interview_scheduled",
    "rejected",
    "hired",
    "withdrawn",
  ]),
});

export const sendAssessmentSchema = z.object({
  assessmentUrl: z.string().trim().url("Assessment URL must be a valid URL").max(2048).refine((url) => url.startsWith("https://"), {
    message: "Assessment URL must start with https://",
  }),
  dueAt: z.string().trim().optional().nullable(),
  instructions: z.string().trim().max(1000, "Instructions are too long").optional().nullable(),
});

export const scheduleInterviewSchema = z.object({
  applicationId: z.string().trim().min(1, "Application ID is required"),
  interviewDate: z.string().trim().min(1, "Interview date is required"),
  interviewTime: z.string().trim().min(1, "Interview time is required"),
  interviewMode: z.string().trim().max(50).optional().default("In-person"),
  meetingLink: z.string().trim().max(2048).optional().nullable(),
  locationDetails: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const contactEmployerSchema = z.object({
  subject: z.string().trim().min(2, "Subject is required").max(200, "Subject is too long"),
  body: z.string().trim().min(5, "Message body must be at least 5 characters").max(5000, "Message body is too long"),
});

