import { Hero } from "@/components/sections/Hero";
import { TrustMetrics } from "@/components/sections/TrustMetrics";
import { ServiceCategories } from "@/components/sections/ServiceCategories";
import { JobPortalBanner } from "@/components/sections/JobPortalBanner";
import { LatestJobsSection } from "@/components/sections/LatestJobsSection";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { FeaturedServices } from "@/components/sections/FeaturedServices";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Hero />
      <TrustMetrics />
      <ServiceCategories />
      <JobPortalBanner />
      <LatestJobsSection />
      <HowItWorks />
      <WhyChooseUs />
      <FeaturedServices />
      <Footer />
    </>
  );
}
