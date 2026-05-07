export type RenewCheckoutMode = "modal" | "redirect";

export type RenewCheckoutConfig = {
  readonly mode?: RenewCheckoutMode;
};

export type RenewCheckoutOpenOptions = {
  readonly mode?: RenewCheckoutMode;
};

export type RenewCheckout = {
  open(checkoutUrl: string, options?: RenewCheckoutOpenOptions): void;
  close(): void;
};

const overlayId = "renew-checkout";
const checkoutMessageSource = "renew.checkout";
let activeCheckoutOrigin: string | null = null;
let messageListener: ((event: MessageEvent) => void) | null = null;

function assertCheckoutUrl(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("checkout.open requires a checkout URL.");
  }

  return normalized;
}

function removeCheckout() {
  document.getElementById(overlayId)?.remove();
  activeCheckoutOrigin = null;

  if (messageListener) {
    window.removeEventListener("message", messageListener);
    messageListener = null;
  }
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  styles: Partial<CSSStyleDeclaration>
) {
  const element = document.createElement(tagName);

  Object.assign(element.style, styles);
  return element;
}

function openModal(url: string) {
  removeCheckout();
  activeCheckoutOrigin = new URL(url, window.location.href).origin;
  messageListener = (event: MessageEvent) => {
    if (activeCheckoutOrigin && event.origin !== activeCheckoutOrigin) {
      return;
    }

    const data =
      typeof event.data === "object" && event.data !== null
        ? (event.data as { source?: unknown; type?: unknown })
        : null;

    if (
      data?.source === checkoutMessageSource &&
      (data.type === "success" || data.type === "close")
    ) {
      removeCheckout();
    }
  };
  window.addEventListener("message", messageListener);

  const overlay = createElement("div", {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 12, 10, 0.48)",
    padding: "20px",
  });
  overlay.id = overlayId;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const wrapper = createElement("div", {
    position: "relative",
    width: "min(480px, 100%)",
    height: "min(720px, 100%)",
  });

  const shell = createElement("div", {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: "18px",
    background: "#ffffff",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.24)",
  });

  const closeButton = createElement("button", {
    position: "absolute",
    right: "-10px",
    top: "-10px",
    zIndex: "2",
    width: "34px",
    height: "34px",
    border: "0",
    borderRadius: "999px",
    background: "rgba(17, 17, 17, 0.92)",
    color: "#ffffff",
    font: "600 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: "1",
    cursor: "pointer",
  });
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close checkout");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", removeCheckout);

  const frame = createElement("iframe", {
    width: "100%",
    height: "100%",
    border: "0",
    background: "#ffffff",
  });
  frame.src = url;
  frame.title = "Renew checkout";
  frame.allow = "payment *";

  shell.append(frame);
  wrapper.append(shell, closeButton);
  overlay.append(wrapper);
  document.body.append(overlay);
}

export function createCheckout(config: RenewCheckoutConfig = {}): RenewCheckout {
  return {
    open(checkoutUrl, options = {}) {
      const url = assertCheckoutUrl(checkoutUrl);

      if (typeof window === "undefined" || typeof document === "undefined") {
        throw new Error("checkout.open must be called in a browser.");
      }

      if ((options.mode ?? config.mode) === "redirect") {
        window.location.href = url;
        return;
      }

      openModal(url);
    },

    close() {
      if (typeof document === "undefined") {
        return;
      }

      removeCheckout();
    },
  };
}

export const checkout = createCheckout();
