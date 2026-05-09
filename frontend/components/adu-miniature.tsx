'use client'

import Image from 'next/image'
import { useRandomAdu } from '@/hooks/use-random-adu'

const DEMO_VISUALS = [
  '/images/viseu/review-board.svg',
  '/images/viseu/corrections-stack.svg',
  '/images/viseu/response-package.svg',
]

const VARIANT_CONFIG = {
  hero: { width: 600, height: 420, className: 'max-w-[60vw]' },
  card: { width: 280, height: 200, className: 'max-w-[280px]' },
  accent: { width: 140, height: 100, className: 'max-w-[140px]' },
  background: { width: 800, height: 560, className: 'max-w-full opacity-20' },
} as const

interface AduMiniatureProps {
  variant: keyof typeof VARIANT_CONFIG
  src?: string
  videoSrc?: string
  alt?: string
  className?: string
}

export function AduMiniature({
  variant,
  src,
  videoSrc,
  alt = 'Ilustracao do fluxo de licenciamento',
  className = '',
}: AduMiniatureProps) {
  const randomSrc = useRandomAdu(DEMO_VISUALS)
  const imageSrc = src || randomSrc
  const config = VARIANT_CONFIG[variant]

  if (videoSrc) {
    return (
      <div className={`flex items-center justify-center ${config.className} ${className}`}>
        <video
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          className="object-contain drop-shadow-lg w-full h-auto"
          style={{ maxWidth: config.width, maxHeight: config.height }}
        />
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center ${config.className} ${className}`}>
      <Image
        src={imageSrc}
        alt={alt}
        width={config.width}
        height={config.height}
        className="object-contain drop-shadow-lg"
        quality={85}
        priority={variant === 'hero'}
      />
    </div>
  )
}
