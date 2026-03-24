import { useState } from 'react'
import { Menu, X } from 'lucide-react'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  const links = [
    { href: '#features', label: 'Product' },
    { href: '#pricing', label: 'Pricing' },
    { href: 'https://docs.rhemify.com', label: 'Docs' },
    { href: 'https://blog.rhemify.com', label: 'Blog' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/60">
      <div className="mx-auto max-w-[1100px] px-6 lg:px-16 h-14 flex items-center justify-between">
        {/* Wordmark */}
        <a href="/" className="text-xl text-foreground">
          <span className="font-normal">Rhem</span>
          <span className="font-bold">ify</span>
        </a>

        {/* Links — desktop */}
        <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-foreground transition-colors duration-[80ms]">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Hamburger — mobile */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-foreground cursor-pointer"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* CTA */}
          <a
            href="/signup"
            className="bg-rhm-accent text-[#1A1F00] px-[18px] py-2 rounded-lg text-[13px] font-medium hover:opacity-[0.88] transition-opacity duration-[80ms]"
          >
            Start free
          </a>
        </div>
      </div>

      {/* Mobile dropdown */}
      {isOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 bg-background border-b border-border p-6 flex flex-col gap-4">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-[80ms]"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  )
}
