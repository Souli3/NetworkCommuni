import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NetworkCommuni",
  description: "Communication LAN - Messages et fichiers en temps réel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
