import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
// import { StatsSection } from "@/components/marketing/StatsSection";
import { Features } from "@/components/marketing/Features";
import { Lifecycle } from "@/components/marketing/Lifecycle";
import { AudienceTabs } from "@/components/marketing/AudienceTabs";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Footer } from "@/components/marketing/Footer";

export const Route = createFileRoute("/_marketing/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="overflow-x-hidden">
      <Navbar />
      <Hero />
      {/*<StatsSection />*/}
      <Features />
      <Lifecycle />
      <AudienceTabs />
      <Pricing />
      <CtaBand />
      <Footer />
    </div>
  );
}
