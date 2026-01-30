import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Numeric Format Converter",
  description: "Convert between decimal and mini-float binary representations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
