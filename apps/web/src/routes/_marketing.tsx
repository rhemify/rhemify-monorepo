import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_marketing')({
  component: MarketingLayout,
})

function MarketingLayout() {
  return (
    <div className="theme-marketing min-h-screen bg-background font-sans text-foreground">
      <Outlet />
    </div>
  )
}
