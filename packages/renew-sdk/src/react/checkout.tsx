"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
  checkout,
  type RenewCheckoutOpenOptions,
} from "../checkout.js";

export type RenewCheckoutProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
> & {
  readonly checkoutUrl: string;
  readonly children?: ReactNode;
  readonly options?: RenewCheckoutOpenOptions;
  readonly onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

export function RenewCheckout({
  checkoutUrl,
  children = "Pay",
  options,
  onClick,
  ...buttonProps
}: RenewCheckoutProps) {
  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          checkout.open(checkoutUrl, options);
        }
      }}
    >
      {children}
    </button>
  );
}

export const RenewCheckoutButton = RenewCheckout;
export type RenewCheckoutButtonProps = RenewCheckoutProps;
