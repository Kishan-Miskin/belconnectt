"use client";

import Footer from "@/components/sections/Footer";
import { motion } from "framer-motion";
import { ArrowRight, Mail, User, Phone, Briefcase, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function ProviderRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");

  const handleSendOTP = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate sending OTP
    setTimeout(() => {
      setIsLoading(false);
      setStep(2);
    }, 1000);
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate verification
    setTimeout(() => {
      setIsLoading(false);
      router.push("/provider");
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-muted/10 text-foreground flex flex-col">
      <div className="flex-1 flex items-center justify-center pt-8 pb-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,var(--primary)/0.05),transparent_30%)]" />
        
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl"
        >
          <div className="rounded-[2rem] border border-border bg-card p-8 sm:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/50 to-primary" />
            
            {step === 1 ? (
              <>
                <div className="text-center mb-10">
                  <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-3">For Professionals</span>
                  <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground mb-2">Grow your business</h1>
                  <p className="text-sm text-muted-foreground">Join thousands of professionals earning on CityConnect</p>
                </div>

                <form onSubmit={handleSendOTP} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Full name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <input
                          type="text"
                          required
                          className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground placeholder-muted-foreground"
                          placeholder="Aarav Sharma"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Phone number</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-muted-foreground font-medium">+91</span>
                        </div>
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          pattern="[0-9]{10}"
                          value={mobile}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            if (val.length <= 10) {
                              setMobile(val);
                            }
                          }}
                          className="block w-full pl-12 pr-3 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground placeholder-muted-foreground"
                          placeholder="9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Primary Service Category</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Briefcase className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <select
                          required
                          defaultValue=""
                          className="block w-full pl-10 pr-10 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground appearance-none"
                        >
                          <option value="" disabled>Select a category</option>
                          <option value="electrical">Electrical & Wiring</option>
                          <option value="plumbing">Plumbing & Pipes</option>
                          <option value="cleaning">Home Cleaning</option>
                          <option value="ac-repair">AC Service & Repair</option>
                          <option value="carpentry">Carpentry & Woodwork</option>
                          <option value="salon">Salon at Home</option>
                          <option value="other">Other</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Service Area / Pincode</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <input
                          type="text"
                          required
                          className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground placeholder-muted-foreground"
                          placeholder="e.g. 590001"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Email address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <input
                        type="email"
                        required
                        className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all sm:text-sm text-foreground placeholder-muted-foreground"
                        placeholder="aarav.sharma@example.com"
                      />
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id="terms"
                        type="checkbox"
                        required
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-card"
                      />
                    </div>
                    <div className="ml-3 text-sm">
                      <label htmlFor="terms" className="font-medium text-muted-foreground">
                        I agree to the <Link href="/terms" className="text-primary hover:underline">Provider Agreement</Link> and understand that my account is subject to background verification.
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || mobile.length !== 10}
                    className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                </form>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground font-medium">
                      Or continue with
                    </span>
                  </div>
                </div>

                <Suspense fallback={<div className="h-11 w-full bg-muted/40 animate-pulse rounded-xl" />}>
                  <GoogleButton accountType="service_provider" />
                </Suspense>

                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Already a provider?{" "}
                    <Link href="/login?role=provider" className="font-semibold text-primary hover:text-primary/80 transition-colors">
                      Log in
                    </Link>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-10">
                  <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground mb-2">Verify OTP</h1>
                  <p className="text-sm text-muted-foreground">
                    Code sent to +91 {mobile} <button onClick={() => setStep(1)} className="text-primary font-medium hover:underline">Edit</button>
                  </p>
                </div>

                <form onSubmit={handleVerifyOTP} className="space-y-5">
                  <div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="[0-9]{4,6}"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="block w-full px-4 py-4 text-center tracking-[0.5em] text-xl font-bold border border-border rounded-xl bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground placeholder-muted-foreground"
                      placeholder="------"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otp.length < 4}
                    className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <>
                        Verify & Apply
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
                
                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the code? <button className="font-semibold text-primary hover:text-primary/80 transition-colors">Resend OTP</button>
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
      
      <Footer />
    </main>
  );
}
