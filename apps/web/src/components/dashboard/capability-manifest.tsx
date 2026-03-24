import type { Agent } from '@/lib/types'

interface CapabilityManifestProps {
  agent: Agent
}

function YamlLine({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <span className="text-[#47c8ff]">{k}</span>
      <span className="text-muted-foreground">: </span>
      <span className={accent ? 'text-rhm-accent' : 'text-foreground'}>{v}</span>
    </div>
  )
}

export function CapabilityManifest({ agent }: CapabilityManifestProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-foreground/20 px-4 py-2.5 border-b border-border">
        Capability manifest
      </div>
      <div className="p-4 font-mono text-[11px] leading-[1.8]">
        <YamlLine k="agent_id" v={`"${agent.id}"`} />
        <YamlLine k="skills" v={`[${agent.skills.map((s) => `"${s}"`).join(',')}]`} />
        <YamlLine k="daily_limit" v={agent.dailyLimit.toFixed(2)} accent />
        <YamlLine
          k="allowed_std"
          v={`[${agent.allowedStandards.map((s) => `"${s}"`).join(',')}]`}
        />
      </div>
    </div>
  )
}
