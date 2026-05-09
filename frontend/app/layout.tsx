import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CrossBeam | Viseu Urbanismo',
  description: 'Assistente para revisao municipal, aperfeicoamento e resposta tecnica em fluxos urbanisticos de Viseu.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt">
      <body className="antialiased bg-crossbeam-gradient">
        {children}
      </body>
    </html>
  )
}
