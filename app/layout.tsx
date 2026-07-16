import type { Metadata } from "next";
import { Fraunces, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./chemmemo.css";

// Self-hosted via next/font (no external Google Fonts <link>). Exposed as CSS
// variables consumed by chemmemo.css (--display / --ui / --mono).
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChemMemo · MFP Lab Notebook",
  description:
    "ChemMemo — AI-assisted lab notebook for prebiotic chemistry research in the MFP lab.",
};

// Set the saved theme before first paint to avoid a flash of wrong theme.
const themeInit = `try{var t=localStorage.getItem("cm-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${fraunces.variable} ${sora.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <div className="bg-stage" aria-hidden="true">
          <div id="bg-image" className="bg-image"></div>
          <div className="bg-gradient"></div>
        </div>
        <div className="bg-mesh" aria-hidden="true"></div>
        <div className="bg-scrim" aria-hidden="true"></div>
        {children}
      </body>
    </html>
  );
}
