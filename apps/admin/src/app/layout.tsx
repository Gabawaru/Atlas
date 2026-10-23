import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas Admin A",
  description: "Console admin entreprise A — file d'approbation MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <header className="top">
          <strong>Atlas Admin</strong>
          <span className="muted">Entreprise A · MVP</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
