import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { buttonClasses } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface shadow-soft">
      <EmptyState
        icon={Compass}
        title="This page does not exist"
        description="The link may be old, or the page may have moved. Your financial records are safe."
        action={
          <Link to="/" className={buttonClasses('primary', 'md')}>
            Back to overview
          </Link>
        }
      />
    </div>
  )
}
