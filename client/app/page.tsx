import { Suspense } from "react";

import { Hero } from "@/components/landing/hero";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { WhoWeServeSection } from "@/components/landing/who-we-serve";
import { FAQSection } from "@/components/landing/faq-section";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";

export default function Home() {
  return (
    <div className="page-shell min-h-screen bg-[linear-gradient(180deg,#e8f5e9_0%,#edf8ed_34%,#f8fbf6_66%,#e8f5e9_100%)]">
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <main>
        <Hero />
        <FeaturesSection />
        <HowItWorksSection />
        <WhoWeServeSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer tone="hero" />
    </div>
  );
}
