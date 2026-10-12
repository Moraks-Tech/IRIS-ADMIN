import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ibadu Rahman International School',
  description: 'Ibadu Rahman International School Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}