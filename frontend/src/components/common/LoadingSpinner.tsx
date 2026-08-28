import clsx from 'clsx'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

export default function LoadingSpinner({ size = 'md', label, className }: Props) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size]
  return (
    <div className={clsx('flex items-center justify-center gap-3', className)}>
      <div className={clsx('border-2 border-surface-700 border-t-brand-500 rounded-full animate-spin', sz)} />
      {label && <span className="text-sm text-surface-400">{label}</span>}
    </div>
  )
}
