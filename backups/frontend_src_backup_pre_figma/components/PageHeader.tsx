import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string
  description?: ReactNode
  eyebrow?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-xs text-muted sm:text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
