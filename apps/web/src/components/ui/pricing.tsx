"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/marketing/Button";

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  highlightLabel?: string;
  buttonVariant?: "default" | "outline";
  ctaHref?: string;
  ctaLabel?: string;
}

export function PricingCard({
  title,
  price,
  description,
  features,
  highlight = false,
  buttonVariant = "outline",
  ctaHref = "#",
  ctaLabel = "Get Started",
}: PricingCardProps) {
  return (
    <div
      className={`flex flex-col justify-between p-6 space-y-4 ${
        highlight ? "bg-secondary rounded-xl w-full md:w-1/2 space-y-0" : "flex-1"
      }`}
    >
      <div className={highlight ? "grid gap-6 w-full" : ""}>
        <div className="space-y-4">
          <div>
            <h2 className="font-medium">{title}</h2>
            <span className="my-3 block text-2xl font-semibold">{price}</span>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>

          <Button
            href={ctaHref}
            className={`w-full justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              buttonVariant === "outline"
                ? "border border-border bg-surface/40 text-text hover:bg-surface"
                : "border border-transparent bg-accent text-btn-primary-text hover:bg-accent-hover"
            }`}
          >
            {ctaLabel}
          </Button>
        </div>
      </div>

      {highlight && (
        <div className="mt-2 text-sm font-semibold md:mt-3">Everything in Free, plus:</div>
      )}

      <ul className={`${highlight ? "mt-0" : "border-t pt-2"} list-outside space-y-3 text-sm`}>
        {features.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <Check className="size-3" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
