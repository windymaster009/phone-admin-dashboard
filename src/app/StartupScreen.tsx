import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock3,
  Database,
  LayoutDashboard,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react'
import type { ShopProfile } from '../lib/api'

export type StartupStage = 'checking-session' | 'loading-sign-in' | 'opening-workspace'

type StageCopy = {
  eyebrow: string
  title: string
  message: string
  steps: [string, string, string]
  activeStep: number
}

const stageCopy: Record<StartupStage, StageCopy> = {
  'checking-session': {
    eyebrow: 'Secure session',
    title: 'Checking your access',
    message: 'Verifying your session and connecting to the shop database.',
    steps: ['Verify session', 'Load workspace', 'Sync dashboard'],
    activeStep: 0,
  },
  'loading-sign-in': {
    eyebrow: 'Secure access',
    title: 'Preparing sign in',
    message: 'Loading the secure PhoneFlow sign-in experience.',
    steps: ['Prepare sign in', 'Secure access', 'Open workspace'],
    activeStep: 0,
  },
  'opening-workspace': {
    eyebrow: 'Shop workspace',
    title: 'Opening PhoneFlow',
    message: 'Loading inventory, pawn, sales, and customer tools.',
    steps: ['Verify session', 'Load workspace', 'Sync dashboard'],
    activeStep: 1,
  },
}

export default function StartupScreen({ stage = 'checking-session', overlay = false, shop }: { stage?: StartupStage; overlay?: boolean; shop: ShopProfile }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [slow, setSlow] = useState(false)
  const copy = stageCopy[stage]
  const brandedCopy = {
    ...copy,
    title: copy.title.replace('PhoneFlow', shop.name),
    message: copy.message.replace('PhoneFlow', shop.name),
  }

  useEffect(() => {
    setSlow(false)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    const slowTimer = window.setTimeout(() => setSlow(true), 8_000)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.clearTimeout(slowTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [stage])

  const statusMessage = useMemo(() => {
    if (!online) return 'Your device is offline. Reconnect to continue.'
    if (slow) return 'This is taking longer than usual. The API or database may still be starting.'
    return brandedCopy.message
  }, [brandedCopy.message, online, slow])

  return (
    <div
      className={`startup-screen startup-screen-${stage}${overlay ? ' startup-screen-overlay' : ''}${online ? '' : ' startup-screen-offline'}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="startup-grid" aria-hidden="true" />
      <div className="startup-glow startup-glow-one" aria-hidden="true" />
      <div className="startup-glow startup-glow-two" aria-hidden="true" />

      <main className="startup-shell">
        <header className="startup-brand">
          <span className="startup-brand-mark" aria-hidden="true">{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <Smartphone size={22} />}</span>
          <span className="startup-brand-copy"><strong>{shop.name}</strong><small>{shop.subtitle}</small></span>
        </header>

        <section className="startup-card">
          <div className="startup-visual" aria-hidden="true">
            <span className="startup-orbit startup-orbit-one" />
            <span className="startup-orbit startup-orbit-two" />
            <div className="startup-phone">
              <span className="startup-phone-speaker" />
              <div className="startup-phone-screen">
                <span className="startup-screen-card startup-screen-card-one" />
                <span className="startup-screen-card startup-screen-card-two" />
                <span className="startup-screen-card startup-screen-card-three" />
                <span className="startup-scan-line" />
              </div>
            </div>
          </div>

          <div className="startup-content">
            <span className="startup-eyebrow">{online ? copy.eyebrow : 'Connection required'}</span>
            <h1>{online ? brandedCopy.title : 'You are offline'}</h1>
            <p>{statusMessage}</p>

            <div className="startup-progress" aria-label={`Loading ${shop.name}`}><span /></div>

            <div className="startup-steps" aria-label="Startup progress">
              {copy.steps.map((label, index) => {
                const complete = online && index < copy.activeStep
                const active = online && index === copy.activeStep
                const StepIcon = index === 0 ? ShieldCheck : index === 1 ? Database : LayoutDashboard
                return (
                  <div key={label} className={`startup-step${complete ? ' complete' : ''}${active ? ' active' : ''}`}>
                    <span className="startup-step-icon">{complete ? <Check size={14} /> : <StepIcon size={15} />}</span>
                    <span className="startup-step-label">{label}</span>
                  </div>
                )
              })}
            </div>

            {(!online || slow) && (
              <div className="startup-help" role="alert">
                <span className="startup-help-icon">{online ? <Clock3 size={18} /> : <WifiOff size={18} />}</span>
                <div>
                  <strong>{online ? 'Still working…' : 'No network connection'}</strong>
                  <span>{online ? 'Check that the PhoneFlow API and MongoDB are running.' : 'Reconnect, then retry loading the app.'}</span>
                </div>
                <button type="button" onClick={() => window.location.reload()}><RefreshCcw size={15} /> Retry</button>
              </div>
            )}
          </div>
        </section>

        <footer className="startup-footer">
          <span><ShieldCheck size={13} /> Secure internal workspace</span>
          <span>{shop.name}</span>
        </footer>
      </main>
    </div>
  )
}
