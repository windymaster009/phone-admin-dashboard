import { AlertCircle, Home } from 'lucide-react'

export default function NotFoundView({ onGoHome }: { onGoHome: () => void }) {
  return (
    <section className="surface-card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '60px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'inline-flex', padding: 16, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--rose, #ef4444)' }}>
        <AlertCircle size={40} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Page Not Found</h2>
      <p style={{ color: 'var(--muted, #64748b)', margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: 380 }}>
        The page you are looking for does not exist, may have been moved, or you may not have permission to view it.
      </p>
      <button type="button" className="primary-button" onClick={onGoHome} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Home size={16} /> Back to Dashboard
      </button>
    </section>
  )
}
