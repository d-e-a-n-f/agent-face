import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlaygroundProvider } from "@/components/playground-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentFace Playground",
  description:
    "Integration and acceptance-test application for the AgentFace SDK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PlaygroundProvider>{children}</PlaygroundProvider>
      </body>
    </html>
  );
}
