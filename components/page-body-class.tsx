"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Applies the existing body.dim CSS (subdued animated background) on every
// inner page so the dashboard hero stays the one "bright" screen.
export function PageBodyClass() {
  const pathname = usePathname();

  useEffect(() => {
    const dim = pathname !== "/dashboard";
    document.body.classList.toggle("dim", dim);
    return () => {
      document.body.classList.remove("dim");
    };
  }, [pathname]);

  return null;
}
