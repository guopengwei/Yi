import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MobileShellChrome, MobileShellProvider } from "./MobileShell";

export function Layout({ children }: { children: ReactNode }) {
  return <MobileShellProvider><ScrollToTop /><MobileShellChrome>{children}</MobileShellChrome></MobileShellProvider>;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
