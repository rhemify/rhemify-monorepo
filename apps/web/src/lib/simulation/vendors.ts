export type VendorEntry = {
  vendor: string;
  domain: string;
  minAmount: number;
  maxAmount: number;
};

export const VENDOR_POOL: Record<string, VendorEntry[]> = {
  ceo: [
    { vendor: "Notion workspace", domain: "notion.so", minAmount: 0.001, maxAmount: 0.05 },
    { vendor: "Slack message", domain: "slack.com", minAmount: 0.001, maxAmount: 0.01 },
  ],
  research: [
    { vendor: "Perplexity query", domain: "perplexity.ai", minAmount: 0.002, maxAmount: 0.01 },
    { vendor: "Bloomberg data", domain: "bloomberg.com", minAmount: 0.1, maxAmount: 0.5 },
    { vendor: "Statista report", domain: "statista.com", minAmount: 0.05, maxAmount: 0.2 },
  ],
  marketing: [
    { vendor: "Canva Pro render", domain: "canva.com", minAmount: 0.05, maxAmount: 0.2 },
    { vendor: "Unsplash license", domain: "unsplash.com", minAmount: 0.01, maxAmount: 0.05 },
    { vendor: "Figma export", domain: "figma.com", minAmount: 0.02, maxAmount: 0.1 },
  ],
  sales: [
    { vendor: "Apollo enrichment", domain: "apollo.io", minAmount: 0.01, maxAmount: 0.05 },
    { vendor: "LinkedIn lookup", domain: "linkedin.com", minAmount: 0.02, maxAmount: 0.08 },
    { vendor: "Clearbit verify", domain: "clearbit.com", minAmount: 0.01, maxAmount: 0.03 },
  ],
  engineering: [
    { vendor: "GitHub action", domain: "github.com", minAmount: 0.001, maxAmount: 0.02 },
    { vendor: "Sentry alert", domain: "sentry.io", minAmount: 0.005, maxAmount: 0.03 },
  ],
  finance: [
    { vendor: "Stripe reconcile", domain: "stripe.com", minAmount: 0.01, maxAmount: 0.05 },
    { vendor: "QuickBooks sync", domain: "quickbooks.com", minAmount: 0.02, maxAmount: 0.08 },
  ],
};

export const BLOCKED_DOMAINS = ["ads.doubleclick.net", "tracker.unknown.com"];
