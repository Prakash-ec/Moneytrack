import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="page">
      <div className="not-found">
        <span>404</span>
        <h1>That page can’t be found</h1>
        <p>The page may have moved, or the address might be incorrect.</p>
        <Link to="/">
          <Button>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Return to dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}
