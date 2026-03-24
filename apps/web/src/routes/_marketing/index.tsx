import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/marketing/Navbar'
import { Hero } from '@/components/marketing/Hero'
import { TrustStrip } from '@/components/marketing/TrustStrip'
import { Features } from '@/components/marketing/Features'
import { AudienceTabs } from '@/components/marketing/AudienceTabs'
import { Pricing } from '@/components/marketing/Pricing'
import { CtaBand } from '@/components/marketing/CtaBand'
import { Footer } from '@/components/marketing/Footer'

export const Route = createFileRoute('/_marketing/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="pt-14 overflow-x-hidden">
      <Navbar />
      <Hero />
      <TrustStrip />
      <Features />
      <AudienceTabs />
      <Pricing />
      <CtaBand />
      <Footer />
    </div>
  )
}
