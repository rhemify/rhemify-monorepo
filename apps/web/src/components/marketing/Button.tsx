"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { ScrambleText } from "./ScrambleText";
import { extractPlainText } from "@/lib/extractPlainText";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "href"> & {
  /** When set, renders an `<a>` with the same hover scramble as `ui/button`. */
  href?: string;
} & Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel" | "download">;

function renderLabel(children: ReactNode) {
  const plain = extractPlainText(children);
  const useScramble = plain != null && plain.trim().length > 0;
  return (
    <span className="relative z-10 inline-flex min-h-0 min-w-0 items-center justify-center whitespace-nowrap">
      {useScramble ? <ScrambleText text={plain.trim()} /> : children}
    </span>
  );
}

/**
 * CTA control with hover character scramble; caller `className` owns layout and colors.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(
    { children, className = "", type = "button", href, target, rel, download, ...rest },
    ref,
  ) {
    const classes =
      `group relative inline-flex min-h-0 min-w-0 items-center justify-center overflow-hidden ${className}`.trim();

    if (href != null && href !== "") {
      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          className={classes}
          target={target}
          rel={rel}
          download={download}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {renderLabel(children)}
        </a>
      );
    }

    return (
      <button ref={ref as Ref<HTMLButtonElement>} type={type} className={classes} {...rest}>
        {renderLabel(children)}
      </button>
    );
  },
);
