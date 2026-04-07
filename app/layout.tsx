import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'INOVA AI ASSISTANT',
  description: 'A futuristic voice and chat AI assistant.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0A0A0A" />
        <link rel="apple-touch-icon" href="https://picsum.photos/seed/inova/192/192" />
      </head>
      <body suppressHydrationWarning className="antialiased">{children}</body>
    </html>
  );
}
