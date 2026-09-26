import "./globals.css";

export const metadata = {
  title: "Nammalekka",
  description: "Billing, inventory, and udhaar for local shops of any kind",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Viewport — viewport-fit=cover lets content reach behind iPhone notch/Dynamic Island */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        {/* Theme colour matches sidebar/hero purple */}
        <meta name="theme-color" content="#5B2CDB" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* black-translucent = iOS status bar overlays content, letting our topbar fill edge-to-edge */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nammalekka" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="apple-touch-icon" href="/logo-mark.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
