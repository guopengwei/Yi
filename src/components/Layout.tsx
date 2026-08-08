import type { ReactNode } from "react";
import { MobileShellChrome, MobileShellProvider } from "./MobileShell";

export function Layout({ children }: { children: ReactNode }) {
  return <MobileShellProvider><MobileShellChrome>{children}</MobileShellChrome></MobileShellProvider>;
}
