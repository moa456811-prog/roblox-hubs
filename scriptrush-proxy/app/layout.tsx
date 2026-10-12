import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import "./globals.css";

export const metadata: Metadata = { title: { default: "ScriptRush — Create your own Roblox script", template: "%s · ScriptRush" }, description: "Choose a Roblox game, describe your idea, and create one complete Luau script. Learn a live game, improve your script, and keep your versions in one place." };

export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body><AppShell>{children}</AppShell></body></html>; }
