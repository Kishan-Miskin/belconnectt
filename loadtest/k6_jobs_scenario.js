import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ─── Custom Metrics ──────────────────────────────────────────────────────────
const jobFeedDuration = new Trend("job_feed_duration", true);
const jobSearchDuration = new Trend("job_search_duration", true);
const jobDetailDuration = new Trend("job_detail_duration", true);
const jobApplyDuration = new Trend("job_apply_duration", true);
const providerActionDuration = new Trend("provider_action_duration", true);
const failedRequests = new Rate("failed_requests");
const successfulApplications = new Counter("successful_applications");

// ─── Target Configuration ────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// ─── Load Test Scenario (20,000 DAU Peak Simulation) ─────────────────────────
export const options = {
  stages: [
    { duration: "10s", target: 50 },   // Warmup to 50 VUs
    { duration: "20s", target: 200 },  // Ramp to 200 VUs
    { duration: "30s", target: 200 },  // Sustained peak load
    { duration: "10s", target: 0 }     // Cooldown
  ],
  thresholds: {
    failed_requests: ["rate<0.01"],            // Error rate < 1%
    job_feed_duration: ["p(95)<400"],          // Read p95 < 400ms
    job_search_duration: ["p(95)<400"],        // Search p95 < 400ms
    job_detail_duration: ["p(95)<400"]         // Detail p95 < 400ms
  }
};

export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  const headers = {
    "Content-Type": "application/json",
    "x-forwarded-for": `198.51.100.${(vuId % 250) + 1}`
  };

  const rand = Math.random();

  if (rand < 0.70) {
    // ═════════════════════════════════════════════════════════════════════════
    // 70% Scenario: Public Job Feed & Search
    // ═════════════════════════════════════════════════════════════════════════
    if (Math.random() < 0.5) {
      // 1. Featured Jobs Feed (Cache-Control: 60s ISR / CDN cached)
      const res = http.get(`${BASE_URL}/api/jobs/featured`, { headers });
      jobFeedDuration.add(res.timings.duration);
      const ok = check(res, { "Featured jobs 200": (r) => r.status === 200 });
      if (!ok) failedRequests.add(1);
    } else {
      // 2. Full-Text / Keyset Search
      const searchTerms = ["developer", "manager", "engineer", "sales", "technician"];
      const term = searchTerms[iterId % searchTerms.length];
      const res = http.get(`${BASE_URL}/api/jobs?q=${term}&limit=10`, { headers });
      jobSearchDuration.add(res.timings.duration);
      const ok = check(res, { "Job search 200": (r) => r.status === 200 });
      if (!ok) failedRequests.add(1);
    }

  } else if (rand < 0.90) {
    // ═════════════════════════════════════════════════════════════════════════
    // 20% Scenario: Job Detail View
    // ═════════════════════════════════════════════════════════════════════════
    const dummyJobId = "00000000-0000-0000-0000-000000000000";
    const res = http.get(`${BASE_URL}/api/jobs/${dummyJobId}`, { headers });
    jobDetailDuration.add(res.timings.duration);
    // 200 or 404 is acceptable for dummy job ID as long as server doesn't 500
    const ok = check(res, { "Job detail 200 or 404": (r) => r.status === 200 || r.status === 404 });
    if (!ok) failedRequests.add(1);

  } else if (rand < 0.98) {
    // ═════════════════════════════════════════════════════════════════════════
    // 8% Scenario: Candidate Application
    // ═════════════════════════════════════════════════════════════════════════
    const dummyJobId = "00000000-0000-0000-0000-000000000000";
    const payload = JSON.stringify({
      fullName: `Applicant ${vuId}`,
      email: `candidate_${vuId}_${iterId}@test.com`,
      phone: "+919876543210",
      experience: "2 years",
      location: "Belagavi",
      coverLetter: "Interested in this position",
      resumePath: `job-resumes/${vuId}/resume.pdf`,
      resumeFilename: "resume.pdf",
      resumeMime: "application/pdf",
      resumeSize: 102400
    });

    const res = http.post(`${BASE_URL}/api/jobs/${dummyJobId}/applications`, payload, { headers });
    jobApplyDuration.add(res.timings.duration);
    // Unauthenticated returns 401, non-existent job returns 404, duplicate 409
    const ok = check(res, { "Apply handled cleanly": (r) => [200, 201, 401, 404, 409].includes(r.status) });
    if (!ok) failedRequests.add(1);
    if (res.status === 200 || res.status === 201) successfulApplications.add(1);

  } else {
    // ═════════════════════════════════════════════════════════════════════════
    // 2% Scenario: Provider Dashboard Actions (Candidates List & Stats)
    // ═════════════════════════════════════════════════════════════════════════
    const statsRes = http.get(`${BASE_URL}/api/jobprovider/stats`, { headers });
    providerActionDuration.add(statsRes.timings.duration);
    const ok = check(statsRes, { "Provider stats handled": (r) => [200, 401, 403].includes(r.status) });
    if (!ok) failedRequests.add(1);
  }

  sleep(0.5);
}
