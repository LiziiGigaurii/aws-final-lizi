import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Framehouse | Image workspace',
  description: 'A private workspace for your image collection.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}