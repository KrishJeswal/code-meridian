import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeBootScript } from "@/components/theme";
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
  title: "Code Meridian",
  description: "Dependency maps of public TypeScript and JavaScript repositories",
};

// Clerk's components read the same tokens as the app, so the sign-in screen
// and the org/user menus follow the theme control without a Clerk theme
// package.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent)",
    colorPrimaryForeground: "var(--accent-contrast)",
    colorBackground: "var(--surface-raised)",
    colorForeground: "var(--text)",
    colorMutedForeground: "var(--text-muted)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--text)",
    colorBorder: "var(--border)",
    colorNeutral: "var(--text)",
    fontFamily: "var(--font-geist-sans)",
    fontSize: "13px",
    borderRadius: "4px",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme before React
    // hydrates, so <html> legitimately differs from the server render.
    <html
      lang="en"
      data-theme="system"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex h-full flex-col text-[13px]">
        <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
