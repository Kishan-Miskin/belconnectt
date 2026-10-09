import { Hero } from "@/components/sections/Hero";
import { TrustMetrics } from "@/components/sections/TrustMetrics";
import { ServiceCategories } from "@/components/sections/ServiceCategories";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Hero />
      <TrustMetrics />
      <ServiceCategories />
      <Footer />
    </>
  );
}
