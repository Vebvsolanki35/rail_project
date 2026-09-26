import type { Metadata } from "next";
import type { ReactNode } from "react";
// Self-hosted fonts (Fontsource) — identical typefaces to the Google Fonts
// versions, but with zero build-time network dependency: `next build` works
// on air-gapped / firewalled machines (booth demos, RailNet-style networks).
//
// Typeface choice for an institutional railway portal:
//   Noto Sans            — the humanist sans used by government and public
//                          information systems; neutral, highly legible in
//                          dense tabular layouts.
//   Noto Sans Devanagari — so the Hindi interface renders in a matching face
//                          instead of falling back to an arbitrary system font.
//   JetBrains Mono       — reference IDs (DEFECT-1024, RR/AUTH/…), figures.
import "@fontsource-variable/noto-sans/index.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import { ThemeProvider } from "@/lib/theme";
import { LangProvider } from "@/lib/lang";
import "./globals.css";

// Font family names registered by the Fontsource CSS above; consumed by
// globals.css through the --font-sans / --font-mono custom properties.
const sansFamily = '"Noto Sans Variable", "Noto Sans Devanagari"';
const monoFamily = '"JetBrains Mono Variable"';

export const metadata: Metadata = {
  title: "RAIL RAKSHAK — Railway Operations & Safety Intelligence Platform",
  description:
    "Divisional operations and safety intelligence for the Delhi NCR rail grid: failure-risk scoring, multi-department block planning with a human decision chain, and the full report-to-release field workflow. Evaluation prototype.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      style={{ "--font-sans": sansFamily, "--font-mono": monoFamily } as React.CSSProperties}
    >
      <body className="antialiased">
        <ThemeProvider>
          <LangProvider>
            {children}
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
