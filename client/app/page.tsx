import { Suspense } from "react";

import { Hero } from "@/components/landing/hero";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { WhoWeServeSection } from "@/components/landing/who-we-serve";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <main>
        <Hero />
        <FeaturesSection />
        <HowItWorksSection />
        <WhoWeServeSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
