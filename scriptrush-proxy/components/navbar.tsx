"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

const links = [{ href: "/", label: "Home" }, { href: "/create", label: "Create" }, { href: "/learn", label: "Learn" }, { href: "/fix", label: "Fix" }, { href: "/history", label: "History" }];

export function Navbar() {
  const pathname = usePathname();
  return <header className="site-header">
    <div className="nav-container">
      <Link href="/" className="brand" aria-label="ScriptRush home"><span className="brand-mark"><Icon name="code" size={22} /></span><span>Script<span className="brand-light">Rush</span><span className="brand-dot">.</span></span></Link>
      <nav className="main-nav" aria-label="Main navigation">{links.map(({ href, label }) => <Link href={href} key={href} className={pathname === href ? "nav-link active" : "nav-link"} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>
      <Link href="/create" className="button nav-cta">Start creating<Icon name="arrow" size={16} /></Link>
    </div>
  </header>;
}

export default Navbar;
