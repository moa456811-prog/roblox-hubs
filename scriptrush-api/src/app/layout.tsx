import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ScriptRush",
  description: "Research-driven Roblox Luau automation generator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
