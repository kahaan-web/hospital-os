import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hospital OS',
  description: 'Multitenant HMIS for nursing homes, clinics and hospitals in India',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className="hos-root antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
