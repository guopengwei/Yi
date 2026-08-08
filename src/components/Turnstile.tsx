import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.append(script);
  });
  return scriptPromise;
}

export function Turnstile({ action, onToken, resetKey = 0 }: { action: string; onToken: (token: string) => void; resetKey?: number }) {
  const id = useId().replace(/:/g, "");
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadTurnstile().then(() => {
      if (!active || !container.current || !window.turnstile) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
        action,
        theme: "auto",
        size: "flexible",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    });
    return () => {
      active = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
    };
  }, [action, id, onToken]);
  useEffect(() => {
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetKey]);
  return <div id={id} className="turnstile" ref={container} aria-label="Bot verification" />;
}
