import "./globals.css";
import { SITE } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { LanguageProvider } from "@/lib/i18n";

export const metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
    url: "/",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Viewport — viewport-fit=cover lets content reach behind iPhone notch/Dynamic Island */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        {/* Browser bar colour; lib/theme.js updates it when the theme changes */}
        <meta name="theme-color" content="#08070f" />
        {/* Apply the saved theme before first paint so Light users never see a dark flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* black-translucent = iOS status bar overlays content, letting our topbar fill edge-to-edge */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nexper" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
