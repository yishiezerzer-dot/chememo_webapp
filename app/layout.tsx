import type { Metadata } from "next";
import "./globals.css";
import "./chemmemo.css";

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
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
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
