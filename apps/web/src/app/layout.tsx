import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { ApiProvider } from "@/trpc/react";
import "./globals.css";

export const metadata = { title: "Web Seed" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ApiProvider>{children}</ApiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
