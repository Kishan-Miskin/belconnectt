"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, MapPin, Globe, Mail, Phone, BadgeCheck, Loader2, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getAuthToken } from "@/lib/jwt";
import { panelVariants } from "../mockData";

export function BusinessProfilePanel() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("services");
  const [companySize, setCompanySize] = useState("1-10");
  const [city, setCity] = useState("Belagavi");
  const [officeAddress, setOfficeAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [aboutCompany, setAboutCompany] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Image upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/business-profile", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load business profile");
      }

      const data = await res.json();
      if (data.profile) {
        const p = data.profile;
        setCompanyName(p.company_name || "");
        setIndustry(p.industry || "services");
        setCompanySize(p.company_size || "1-10");
        setCity(p.city || "Belagavi");
        setOfficeAddress(p.office_address || "");
        setWebsite(p.website || "");
        setContactEmail(p.contact_email || "");
        setContactPhone(p.contact_phone || "");
        setAboutCompany(p.about_company || "");
        setLogoUrl(p.logo_url || null);
      }
    } catch (err: any) {
      console.error("Fetch profile error:", err);
      setError("Failed to fetch business profile details.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid image file (PNG, JPG, WEBP)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image file size must be less than 10MB");
      return;
    }

    setUploadError(null);
    setUploadingLogo(true);

    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload image");
      }

      if (data.url) {
        setLogoUrl(data.url);
      }
    } catch (err: any) {
      console.error("Logo upload error:", err);
      setUploadError(err.message || "Failed to upload logo image");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = getAuthToken();
      const res = await fetch("/api/jobprovider/business-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          companyName: companyName.trim(),
          industry,
          companySize,
          city: city.trim(),
          officeAddress: officeAddress.trim(),
          website: website.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          aboutCompany: aboutCompany.trim(),
          logoUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save profile");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setError(err.message || "Failed to save business profile");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "block w-full px-3.5 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground placeholder-muted-foreground";
  const labelCls = "block text-sm font-medium text-foreground mb-2";

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-medium">Loading business profile...</p>
      </div>
    );
  }

  return (
    <motion.div {...panelVariants}>
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-xl text-foreground">{t("jobprovider.businessProfile")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("jobprovider.businessProfileSubtitle")}</p>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-semibold text-xs animate-in fade-in">
              <CheckCircle2 className="h-4 w-4" /> Profile Saved
            </span>
          )}
        </div>

        {error && (
          <div className="m-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {/* Logo upload */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-4 rounded-2xl border border-border bg-muted/20">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-border bg-muted/50 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer overflow-hidden shrink-0 group"
            >
              {uploadingLogo ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : logoUrl ? (
                <>
                  <img src={logoUrl} alt="Company Logo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                    Change
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 mb-1 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-[10px] font-semibold text-muted-foreground">Upload Logo</span>
                </>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t("jobprovider.companyLogo")}</p>
              <p className="text-xs text-muted-foreground">{t("jobprovider.logoRecommendation")}</p>
              {uploadError && <p className="text-xs text-rose-500 font-medium">{uploadError}</p>}
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                {uploadingLogo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" /> Select Logo Image
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t("jobprovider.companyName")} *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  className={`${inputCls} pl-9`}
                  placeholder="e.g. BelTech Solutions Pvt. Ltd."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t("jobprovider.industry")} *</label>
              <select
                className={inputCls}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="services">Professional Services</option>
                <option value="construction">Construction</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="retail">Retail</option>
                <option value="it">IT & Technology</option>
                <option value="healthcare">Healthcare</option>
                <option value="education">Education</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>{t("jobprovider.cityLocation")} *</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  className={`${inputCls} pl-9`}
                  placeholder="e.g. Belagavi, Karnataka"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t("jobprovider.companySize")}</label>
              <select
                className={inputCls}
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
              >
                <option value="1-10">1–10 employees</option>
                <option value="11-50">11–50 employees</option>
                <option value="51-200">51–200 employees</option>
                <option value="201+">201+ employees</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>{t("jobprovider.website")}</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="url"
                  className={`${inputCls} pl-9`}
                  placeholder="https://yourcompany.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t("jobprovider.contactEmail")} *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  className={`${inputCls} pl-9`}
                  placeholder="hr@yourcompany.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contact Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="tel"
                  className={`${inputCls} pl-9`}
                  placeholder="+91 9876543210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("jobprovider.aboutCompany")}</label>
            <textarea
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder="Describe your company, culture, and what makes it a great place to work..."
              value={aboutCompany}
              onChange={(e) => setAboutCompany(e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>{t("jobprovider.officeAddress")}</label>
            <input
              type="text"
              className={inputCls}
              placeholder="Full office address in Belagavi / North Karnataka"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-border">
            <button
              type="submit"
              disabled={saving}
              className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                saved
                  ? "bg-emerald-500 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : saved ? (
                `✓ ${t("jobprovider.saved")}`
              ) : (
                t("jobprovider.saveProfile")
              )}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
