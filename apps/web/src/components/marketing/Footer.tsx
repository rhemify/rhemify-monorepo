export function Footer() {
  const linkClass = "block text-[13px] text-foreground py-[3px] hover:text-muted-foreground transition-colors"
  const headingClass = "text-xs uppercase tracking-[0.08em] text-muted-foreground font-medium mb-3"

  return (
    <footer className="bg-background border-t-[0.5px] border-border p-12 px-6">
      <div className="mx-auto max-w-[1100px]">
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="text-lg text-foreground">
              <span className="font-normal">Rhem</span>
              <span className="font-bold">ify</span>
            </div>
            <p className="text-[13px] text-muted-foreground mt-2">
              The payment layer for agent companies.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className={headingClass}>Product</h4>
            <a href="#" className={linkClass}>Fleet</a>
            <a href="#" className={linkClass}>Policies</a>
            <a href="#" className={linkClass}>SDK</a>
            <a href="#" className={linkClass}>Pricing</a>
          </div>

          {/* Company */}
          <div>
            <h4 className={headingClass}>Company</h4>
            <a href="#" className={linkClass}>About</a>
            <a href="#" className={linkClass}>Blog</a>
            <a href="#" className={linkClass}>Careers</a>
          </div>

          {/* Resources */}
          <div>
            <h4 className={headingClass}>Resources</h4>
            <a href="#" className={linkClass}>Docs</a>
            <a href="#" className={linkClass}>Help</a>
            <a href="#" className={linkClass}>Status</a>
            <a href="#" className={linkClass}>Twitter/X</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
