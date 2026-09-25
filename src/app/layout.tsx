import type { Metadata } from "next";
import type { ReactNode } from "react";
// Self-hosted fonts (Fontsource) — identical typefaces to the Google Fonts
// versions, but with zero build-time network dependency: `next build` works
// on air-gapped / firewalled machines (booth demos, RailNet-style networks).
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import { ThemeProvider } from "@/lib/theme";
import { LangProvider } from "@/lib/lang";
import "./globals.css";

// Font family names registered by the Fontsource CSS above; consumed by
// globals.css through the --font-sans / --font-mono custom properties.
const sansFamily = "Plus Jakarta Sans Variable";
const monoFamily = "JetBrains Mono Variable";

export const metadata: Metadata = {
  title: "RAIL RAKSHAK — AI Block Planning for Indian Railways",
  description:
    "Smart block planning for the Delhi NCR rail grid: failure-risk scoring, multi-department scheduling, stress testing, and the full report-to-release field workflow.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      style={{ "--font-sans": sansFamily, "--font-mono": monoFamily } as React.CSSProperties}
    >
      <body className="antialiased selection:bg-cyan/20 selection:text-cyan dark:selection:bg-cyan/25 dark:selection:text-cyan">
        <ThemeProvider>
          <LangProvider>
            {children}
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
