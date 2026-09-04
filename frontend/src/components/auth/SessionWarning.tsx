import { useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  onContinue: () => void
  onLogout: () => void
}

export default function SessionWarning({ onContinue, onLogout }: Props) {
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    continueRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onLogout() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onLogout])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      role="dialog" aria-modal="true" aria-labelledby="session-warning-title"
    >
      <div className="card p-6 max-w-sm w-full mx-4 shadow-2xl border border-amber-800/40">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 id="session-warning-title" className="text-base font-semibold text-white">
              Session expiring soon
            </h2>
            <p className="text-sm text-surface-400 mt-1">
              Your session will expire in 5 minutes. Continue working?
            </p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm text-surface-400 hover:text-surface-200 rounded-lg hover:bg-surface-800 transition-colors"
          >
            Log out
          </button>
          <button
            ref={continueRef}
            onClick={onContinue}
            className="btn-primary px-5 py-2 text-sm font-semibold rounded-lg"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
