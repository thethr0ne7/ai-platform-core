import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./mobile-fixes.css";

export const metadata: Metadata = {
  title: "Платформа анализа господдержки",
  description: "Проверка мер поддержки, нормативных документов и готовности проекта по официальным источникам."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
