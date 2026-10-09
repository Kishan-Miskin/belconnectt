import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobprovider/business-profile — Fetch Profile ─────────────────
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
        { error: "Forbidden: Only job providers can access business profiles" },
        { status: 403 }
      );
    }

    const providerId = authUser.userId;

    const profileRes = await query(
      `SELECT * FROM business_profiles WHERE job_provider_id = $1 LIMIT 1`,
      [providerId]
    );

    if (profileRes.rows.length > 0) {
      return NextResponse.json({ profile: profileRes.rows[0] });
    }

    // Fallback default info from job_providers
    const jpRes = await query(
      `SELECT id, name, email, phone, avatar FROM job_providers WHERE id = $1 LIMIT 1`,
      [providerId]
    );

    const jp = jpRes.rows[0];

    const defaultProfile = {
      id: null,
      job_provider_id: providerId,
      company_name: "",
      industry: "services",
      company_size: "1-10",
      city: "Belagavi",
      office_address: "",
      website: "",
      contact_email: jp?.email || "",
      contact_phone: jp?.phone || "",
      about_company: "",
      logo_url: null,
    };

    return NextResponse.json({ profile: defaultProfile });
  } catch (error: any) {
    console.error("GET /api/jobprovider/business-profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch business profile" },
      { status: 500 }
    );
  }
}

// ── PUT /api/jobprovider/business-profile — Upsert Profile ────────────────
export async function PUT(request: Request) {
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
        { error: "Forbidden: Only job providers can edit business profiles" },
        { status: 403 }
      );
    }

    const providerId = authUser.userId;
    const body = await request.json();

    const {
      companyName,
      industry = "services",
      companySize = "1-10",
      city = "Belagavi",
      officeAddress = "",
      website = "",
      contactEmail = "",
      contactPhone = "",
      aboutCompany = "",
      logoUrl = null,
    } = body;

    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const profileId = `bp_${providerId}`;

    const upsertSql = `
      INSERT INTO business_profiles (
        id,
        job_provider_id,
        company_name,
        industry,
        company_size,
        city,
        office_address,
        website,
        contact_email,
        contact_phone,
        about_company,
        logo_url,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
      )
      ON CONFLICT (job_provider_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        industry = EXCLUDED.industry,
        company_size = EXCLUDED.company_size,
        city = EXCLUDED.city,
        office_address = EXCLUDED.office_address,
        website = EXCLUDED.website,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        about_company = EXCLUDED.about_company,
        logo_url = EXCLUDED.logo_url,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await query(upsertSql, [
      profileId,
      providerId,
      companyName.trim(),
      industry.trim(),
      companySize.trim(),
      city.trim(),
      officeAddress?.trim() || null,
      website?.trim() || null,
      contactEmail?.trim() || null,
      contactPhone?.trim() || null,
      aboutCompany?.trim() || null,
      logoUrl || null,
    ]);

    // Also sync company_name to job_providers.name for consistency
    await query(`UPDATE job_providers SET name = $1, avatar = COALESCE($2, avatar) WHERE id = $3`, [
      companyName.trim(),
      logoUrl || null,
      providerId,
    ]).catch(() => {});

    return NextResponse.json({
      success: true,
      profile: res.rows[0],
      message: "Business profile saved successfully",
    });
  } catch (error: any) {
    console.error("PUT /api/jobprovider/business-profile error:", error);
    return NextResponse.json(
      { error: "Failed to save business profile" },
      { status: 500 }
    );
  }
}
