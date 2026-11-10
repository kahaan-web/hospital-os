import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/noto-sans-devanagari/400.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hospital OS',
  description: 'Multitenant HMIS for nursing homes, clinics and hospitals in India',
};

const themeBoot = `(function(){try{var s=localStorage.getItem('hos-theme');var m=window.matchMedia('(prefers-color-scheme: dark)');var r=s==='dark'||s==='light'?s:(m.matches?'dark':'light');document.documentElement.dataset.theme=r;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="hos-root antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
