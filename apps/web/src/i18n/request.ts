import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  ko: () => import("@repo/i18n/messages/ko"),
  en: () => import("@repo/i18n/messages/en"),
};

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = LOCALES.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : "ko";
  return {
    locale,
    messages: (await loaders[locale]()).default,
  };
});
