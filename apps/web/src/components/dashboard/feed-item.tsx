import type { Transaction } from '@/lib/types'

interface FeedItemProps {
  transaction: Transaction
}

export function FeedItem({ transaction }: FeedItemProps) {
  const isBlocked = transaction.status === 'blocked'

  return (
    <>
      <style>{`
        @keyframes rhemify-feed-slide {
          from { transform: translateX(-8px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div
        className={`px-5 py-3.5 border-b border-white/[0.03] transition-colors duration-150 hover:bg-white/[0.04] ${
          isBlocked ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]' : ''
        }`}
        style={{ animation: 'rhemify-feed-slide 250ms ease-out both' }}
      >
        <div className="flex justify-between items-center">
          <span className="text-[13px] font-medium text-foreground">{transaction.agentName}</span>
          {isBlocked ? (
            <span className="font-mono text-xs text-rhm-danger">blocked</span>
          ) : (
            <span className="font-mono text-xs text-white/50">${transaction.amount.toFixed(2)}</span>
          )}
        </div>
        <div className="font-mono text-[11px] text-white/20 mt-1">
          {transaction.standard} &middot; {transaction.vendor}
        </div>
      </div>
    </>
  )
}
