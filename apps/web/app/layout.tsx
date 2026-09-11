import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Streamforge",
  description: "Upload video, transcode to HLS, and play it back.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              Streamforge
            </Link>
            <span className="topbar-note">HLS · FFmpeg · MinIO</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
