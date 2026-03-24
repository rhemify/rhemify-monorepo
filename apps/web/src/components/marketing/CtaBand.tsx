export function CtaBand() {
  return (
    <section className="bg-foreground py-[72px] px-6 text-center">
      <h2 className="text-[clamp(28px,5vw,36px)] font-bold text-[#F0F0F2]">Deploy your company &rarr;</h2>
      <p className="text-base text-muted-foreground mt-3">
        Free tier. No card required. Live in 2 minutes.
      </p>
      <a
        href="/signup"
        className="mt-7 bg-rhm-accent text-[#1A1F00] px-8 py-3.5 rounded-lg text-[15px] font-medium hover:opacity-[0.88] transition-opacity duration-[80ms] inline-block"
      >
        Start free
      </a>
    </section>
  )
}
