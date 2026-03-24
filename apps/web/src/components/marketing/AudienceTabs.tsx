import { useState } from 'react'

const tabs = [
  {
    id: 'founders',
    label: 'Founders',
    headline: 'Your agents pay with your card. You see everything in dollars.',
    body: 'Toggle departments on or off. Each active department is one agent, billed monthly at $9.00/agent. Free tier includes CEO agent + 2 departments. No card required to start.',
  },
  {
    id: 'web3',
    label: 'Web3 teams',
    headline: 'Multi-chain. MPP-native. Non-custodial.',
    body: 'npm install @rhemify/sdk — everything you need to integrate agent payments into your protocol. Solana, EVM, and stablecoin rails built in.',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    headline: 'Fleet controls. SOC 2. Approval workflows. Audit logs.',
    body: 'Manage hundreds of agents with role-based access, custom policies, and compliance-ready audit trails. Built for teams that need control at scale.',
  },
]

export function AudienceTabs() {
  const [activeTab, setActiveTab] = useState('founders')
  const current = tabs.find((t) => t.id === activeTab)!

  return (
    <section className="bg-background py-24">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="font-mono text-xs uppercase text-muted-foreground tracking-[0.1em] mb-2">BUILT FOR YOU</p>
        <h2 className="text-[clamp(28px,5vw,38px)] font-bold mb-8">However you build</h2>

        <div className="bg-card p-1 rounded-lg w-fit mx-auto mb-10 flex flex-wrap justify-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 text-[13px] font-medium rounded-md cursor-pointer transition-all duration-150 ${
                activeTab === tab.id
                  ? 'bg-white shadow-sm text-foreground'
                  : 'transparent text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-w-[560px] mx-auto">
          <div className="transition-opacity duration-150">
            <h3 className="text-xl font-bold mb-3">{current.headline}</h3>
            <p className="text-[15px] text-muted-foreground leading-[1.7]">{current.body}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
