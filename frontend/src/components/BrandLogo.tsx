import { useTheme } from '@/providers/ThemeProvider'

interface BrandLogoProps {
  variant?: 'icon' | 'squircle' | 'horizontal'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  className?: string
  alt?: string
}

export function BrandLogo({
  variant = 'horizontal',
  size = 'md',
  className = '',
  alt = 'MoneyTrack',
}: BrandLogoProps) {
  let resolvedTheme = 'dark'
  try {
    const themeContext = useTheme()
    resolvedTheme = themeContext.resolvedTheme
  } catch {
    // If rendered outside ThemeProvider (e.g. tests or early fallback)
    resolvedTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }

  // Dimension presets
  const sizeMap: Record<string, { width: number; height: number }> = {
    xs: variant === 'horizontal' ? { width: 105, height: 24 } : { width: 24, height: 24 },
    sm: variant === 'horizontal' ? { width: 140, height: 32 } : { width: 32, height: 32 },
    md: variant === 'horizontal' ? { width: 175, height: 40 } : { width: 44, height: 44 },
    lg: variant === 'horizontal' ? { width: 210, height: 48 } : { width: 56, height: 56 },
    xl: variant === 'horizontal' ? { width: 280, height: 64 } : { width: 80, height: 80 },
  }

  const dims =
    typeof size === 'number'
      ? variant === 'horizontal'
        ? { width: Math.round(size * 4.375), height: size }
        : { width: size, height: size }
      : sizeMap[size] || sizeMap.md

  let src = '/branding/moneytrack-logo-dark.svg'
  if (variant === 'icon') {
    src = '/branding/moneytrack-icon.svg'
  } else if (variant === 'squircle') {
    src = '/branding/moneytrack-squircle.svg'
  } else {
    // horizontal
    src =
      resolvedTheme === 'dark'
        ? '/branding/moneytrack-logo-dark.svg'
        : '/branding/moneytrack-logo-light.svg'
  }

  return (
    <img
      src={src}
      width={dims.width}
      height={dims.height}
      alt={alt}
      style={{
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        maxWidth: `${dims.width}px`,
        maxHeight: `${dims.height}px`,
        aspectRatio: variant === 'horizontal' ? '175 / 40' : '1 / 1',
      }}
      className={`inline-block select-none shrink-0 object-contain ${className}`}
      loading="eager"
      decoding="async"
    />
  )
}
