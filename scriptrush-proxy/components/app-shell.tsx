import Link from "next/link";
import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Icon } from "./icon";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell"><a href="#main-content" className="skip-link">Skip to content</a><Navbar /><main id="main-content" className="main-content">{children}</main><footer className="site-footer"><div className="footer-inner"><Link href="/" className="footer-brand"><Icon name="code" size={18} />ScriptRush</Link><p>Your ideas. One complete script.</p><span className="footer-note">Create · Learn · Improve</span></div></footer></div>;
}

export default AppShell;
