import { useTransactions } from '@/lib/hooks'
import { FeedItem } from '@/components/dashboard/feed-item'

export function LiveFeed() {
  const { data: transactions } = useTransactions(15)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <style>{`
        @keyframes rhemify-feed-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div className="px-5 py-3.5 border-b border-border text-[13px] font-medium text-muted-foreground flex items-center justify-between">
        <span>Live transactions</span>
        <span
          className="w-1.5 h-1.5 rounded-full bg-rhm-success"
          style={{ animation: 'rhemify-feed-pulse 2s infinite ease-in-out' }}
        />
      </div>
      <div className="max-h-[840px] overflow-y-auto">
        {transactions?.map((tx) => (
          <FeedItem key={tx.id} transaction={tx} />
        ))}
      </div>
    </div>
  )
}
