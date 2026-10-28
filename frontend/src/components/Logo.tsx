/** DataGuard mark: a shield holding three rising bars ("guarded data"), plus the wordmark. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M16 2 4 6.5v8.2c0 7.4 5.1 13.4 12 15.3 6.9-1.9 12-7.9 12-15.3V6.5L16 2Z" className="fill-brand" />
      <rect x="10" y="16" width="3" height="6" rx="1" className="fill-brand-on" />
      <rect x="14.5" y="12" width="3" height="10" rx="1" className="fill-brand-on" />
      <rect x="19" y="9" width="3" height="13" rx="1" className="fill-brand-on" />
    </svg>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={large ? 'h-11 w-11' : 'h-8 w-8'} />
      <span className={`font-bold tracking-tight text-ink ${large ? 'text-3xl' : 'text-lg'}`}>
        Data<span className="text-brand-ink">Guard</span>
      </span>
    </span>
  )
}
