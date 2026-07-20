import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Government Intelligence Platform",
  description: "Evidence-first analysis of grants, support measures and project readiness."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
