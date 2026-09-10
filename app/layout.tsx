import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Little Us — a tiny arcade for two',
  description: 'Simple games, inside jokes, and a little friendly competition for you and your favourite person.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
