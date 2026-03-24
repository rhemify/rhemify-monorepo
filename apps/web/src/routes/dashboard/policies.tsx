import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAgents, usePolicies, useUpdatePolicy } from '@/lib/hooks'
import { PolicySliders } from '@/components/dashboard/policy-sliders'
import { StandardChips } from '@/components/dashboard/standard-chips'
import { DomainTags } from '@/components/dashboard/domain-tags'
import type { PaymentStandard, Policy } from '@/lib/types'

export const Route = createFileRoute('/dashboard/policies')({
  component: PoliciesScreen,
})

function PoliciesScreen() {
  const { data: agents } = useAgents()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const agentId = selectedId ?? agents?.[0]?.id ?? ''
  const selectedAgent = agents?.find((a) => a.id === agentId)

  const { data: policy } = usePolicies(agentId)
  const { mutate: updatePolicy } = useUpdatePolicy()

  const handleUpdate = (updates: Partial<Policy>) => {
    if (!agentId) return
    updatePolicy({ agentId, updates })
  }

  const handleToggleStandard = (standard: PaymentStandard) => {
    if (!policy) return
    const current = policy.allowedStandards
    const next = current.includes(standard)
      ? current.filter((s) => s !== standard)
      : [...current, standard]
    handleUpdate({ allowedStandards: next })
  }

  const handleAddDomain = (domain: string) => {
    if (!policy) return
    if (policy.domainAllowlist.includes(domain)) return
    handleUpdate({ domainAllowlist: [...policy.domainAllowlist, domain] })
  }

  const handleRemoveDomain = (domain: string) => {
    if (!policy) return
    handleUpdate({ domainAllowlist: policy.domainAllowlist.filter((d) => d !== domain) })
  }

  if (!agents?.length) {
    return <div className="text-foreground/20 p-10">No agents available.</div>
  }

  return (
    <div>
      <select
        className="bg-card border border-border rounded-lg px-3.5 py-2 font-mono text-[13px] text-foreground cursor-pointer outline-none mb-6"
        value={agentId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <div className="text-lg font-semibold text-foreground mb-6">
        {selectedAgent?.name ?? 'Agent'} agent — policy controls
      </div>

      {policy && (
        <div className="grid grid-cols-2 gap-4 items-start">
          <PolicySliders policy={policy} onUpdate={handleUpdate} />
          <div className="flex flex-col gap-4">
            <StandardChips
              allowedStandards={policy.allowedStandards}
              onToggle={handleToggleStandard}
            />
            <DomainTags
              domains={policy.domainAllowlist}
              onAdd={handleAddDomain}
              onRemove={handleRemoveDomain}
            />
          </div>
        </div>
      )}
    </div>
  )
}
