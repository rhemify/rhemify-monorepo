import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router'
import { useTheme } from '@/lib/theme/theme-provider'
import { useEffect } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'

const TITLE_MAP: Record<string, string> = {
  '/dashboard/': 'Fleet overview',
  '/dashboard/policies': 'Policies',
  '/dashboard/wallets': 'Wallets',
  '/dashboard/approvals': 'Approvals',
}

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  const { setTheme } = useTheme()
  const matches = useMatches()
  const lastMatch = matches[matches.length - 1]
  const routeId = lastMatch?.routeId ?? ''
  const title = routeId.includes('agent.')
    ? 'Agent detail'
    : (TITLE_MAP[routeId] ?? 'Fleet overview')

  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  return (
    <div className="dark flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
