import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useSetSession } from '@/lib/hooks'
import type { UserRole } from '@/lib/types'
import { SegmentedControl } from '@/components/onboarding/segmented-control'

export const Route = createFileRoute('/_onboarding/signup')({
  component: SignupScreen,
})

function SignupScreen() {
  const navigate = useNavigate()
  const setSession = useSetSession()
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState<UserRole>('solo-founder')

  const handleSubmit = () => {
    setSession.mutate({
      email: email || 'alex@mybrand.com',
      companyName: companyName || 'My Brand Co.',
      role,
      activeDepartments: ['ceo'],
      monthlySpendCap: 100,
      isDeployed: false,
    })
    navigate({ to: '/build' })
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] mb-1.5">
        Start your agent company
      </h1>
      <p className="text-muted-foreground text-[13px] mb-8">
        No credit card required to get started.
      </p>

      <div className="mb-[18px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Work email</label>
        <input
          type="text"
          placeholder="alex@mybrand.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 w-full border border-border rounded-lg bg-card text-foreground text-[13px] px-3 outline-none transition-all duration-150 focus:ring-2 focus:ring-rhm-accent/40"
        />
      </div>

      <div className="mb-[18px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Company name</label>
        <input
          type="text"
          placeholder="My Brand Co."
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="h-9 w-full border border-border rounded-lg bg-card text-foreground text-[13px] px-3 outline-none transition-all duration-150 focus:ring-2 focus:ring-rhm-accent/40"
        />
      </div>

      <div className="mb-7">
        <SegmentedControl
          label="I am a..."
          options={[
            { value: 'solo-founder', label: 'Solo founder' },
            { value: 'small-team', label: 'Small team' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
          value={role}
          onChange={(v) => setRole(v as UserRole)}
        />
      </div>

      <button
        onClick={handleSubmit}
        className="w-full h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-[0.88] transition-opacity duration-150 cursor-pointer"
      >
        Set up my company →
      </button>
    </div>
  )
}
