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
  title: "agentface playground",
  description:
    "Integration and acceptance-test application for the AgentFace SDK",
  metadataBase: new URL("https://agentface.dev"),
  openGraph: {
    title: "agentface playground",
    description:
      "The agent interface layer for software — try it against a working mini-app.",
    images: ["/brand/agentface-mark-gradient.svg"],
  },
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
