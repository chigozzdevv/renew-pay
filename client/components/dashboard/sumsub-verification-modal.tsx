"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { LoadingState, Modal } from "@/components/dashboard/ui";

const SUMSUB_SDK_SRC =
  "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";

type SumsubWebSdkInstance = {
  launch: (selector: string) => void;
};

type SumsubWebSdkBuilder = {
  withConf: (config: Record<string, unknown>) => SumsubWebSdkBuilder;
  withOptions: (options: Record<string, unknown>) => SumsubWebSdkBuilder;
  on: (
    eventName: string,
    handler: (payload: unknown) => void
  ) => SumsubWebSdkBuilder;
  build: () => SumsubWebSdkInstance;
};

type SumsubWebSdkGlobal = {
  init: (
    accessToken: string,
    tokenExpirationHandler: () => Promise<string>
  ) => SumsubWebSdkBuilder;
};

declare global {
  interface Window {
    snsWebSdk?: SumsubWebSdkGlobal;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadSumsubSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser is not available."));
  }

  if (window.snsWebSdk) {
    return Promise.resolve();
  }

  sdkLoadPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SUMSUB_SDK_SRC}"]`
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Verification could not load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SUMSUB_SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Verification could not load."));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export function SumsubVerificationModal({
  open,
  accessToken,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  accessToken: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const containerId = useMemo(
    () => `sumsub-websdk-${Math.random().toString(36).slice(2)}`,
    []
  );
  const onSubmittedRef = useRef(onSubmitted);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    onSubmittedRef.current = onSubmitted;
  }, [onSubmitted]);

  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    let isCurrent = true;
    const container = document.getElementById(containerId);

    if (container) {
      container.innerHTML = "";
    }

    setError(null);
    setIsLoading(true);

    void loadSumsubSdk()
      .then(() => {
        if (!isCurrent || !window.snsWebSdk) {
          return;
        }

        const instance = window.snsWebSdk
          .init(accessToken, () => Promise.resolve(accessToken))
          .withConf({
            lang: "en",
            theme: "light",
          })
          .withOptions({
            addViewportTag: false,
            adaptIframeHeight: true,
          })
          .on("idCheck.onApplicantSubmitted", () => {
            onSubmittedRef.current?.();
          })
          .on("idCheck.onError", () => {
            if (isCurrent) {
              setError("Verification could not continue.");
            }
          })
          .build();

        instance.launch(`#${containerId}`);

        if (isCurrent) {
          setIsLoading(false);
        }
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Verification could not load."
        );
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
      const latestContainer = document.getElementById(containerId);

      if (latestContainer) {
        latestContainer.innerHTML = "";
      }
    };
  }, [accessToken, containerId, open]);

  return (
    <Modal open={open} onClose={onClose} title="Verification" size="xl">
      <div className="min-h-[520px]">
        {isLoading ? (
          <LoadingState label="Loading verification" className="min-h-[18rem]" />
        ) : null}
        {error ? (
          <div className="rounded-xl border border-[#ecd0cc] bg-[#fff6f5] px-4 py-3 text-sm text-[#9b3d31]">
            {error}
          </div>
        ) : null}
        <div id={containerId} className={isLoading ? "hidden" : "block"} />
      </div>
    </Modal>
  );
}
