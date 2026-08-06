import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, Boxes, HandCoins, Smartphone } from 'lucide-react'
import { api, setToken, type SessionUser } from '../lib/api'

function ErrorNotice({ message }: { message: string }) {
  return <div className="error-notice"><AlertTriangle size={16} /> {message}</div>
}

function StardustBackground({ theme }: { theme: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    type Point = { x: number; y: number; opacity: number; speed: number; direction: 1 | -1; blinking: boolean }
    let points: Point[] = []
    let frame = 0
    let lastFrame = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      const gap = 12
      points = []
      for (let x = 0; x < width; x += gap) {
        for (let y = 0; y < height; y += gap) {
          if (Math.random() <= 0.1) continue
          points.push({
            x,
            y,
            opacity: Math.random() * 0.7,
            speed: 0.006 + Math.random() * 0.026,
            direction: Math.random() > 0.5 ? 1 : -1,
            blinking: Math.random() < 0.4,
          })
        }
      }
    }

    const draw = (time = 0) => {
      if (!reducedMotion && time - lastFrame < 16) {
        frame = window.requestAnimationFrame(draw)
        return
      }
      lastFrame = time
      context.fillStyle = theme === 'light' ? '#eaf1eb' : '#000'
      context.fillRect(0, 0, window.innerWidth, window.innerHeight)
      for (const point of points) {
        if (!reducedMotion && point.blinking) {
          point.opacity += point.speed * point.direction
          if (point.opacity >= 0.9) point.direction = -1
          if (point.opacity <= 0.1) point.direction = 1
        }
        context.fillStyle = theme === 'light'
          ? `rgba(31,73,48,${point.opacity * 0.34})`
          : `rgba(255,255,255,${point.opacity})`
        context.fillRect(point.x, point.y, 2, 2)
      }
      if (!reducedMotion) frame = window.requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(frame)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="auth-stardust" aria-hidden="true" />
}

export default function AuthScreen({
  onAuthenticated,
  theme,
}: {
  onAuthenticated: (user: SessionUser) => void
  theme: 'dark' | 'light'
}) {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ setupRequired: boolean }>('/auth/status')
      .then((result) => setSetupRequired(result.setupRequired))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
    }

    try {
      const result = await api<{ token: string; user: SessionUser }>(setupRequired ? '/auth/bootstrap' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { retryTransient: setupRequired === false })
      setToken(result.token)
      onAuthenticated(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <StardustBackground theme={theme} />
      <section className="auth-shell">
        <motion.div
          className="auth-brand"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <span className="auth-logo"><Smartphone size={22} /></span>
          <span><strong>PhoneFlow</strong><small>Shop management</small></span>
        </motion.div>

        <div className="auth-layout">
          <motion.aside
            className="auth-overview"
            initial={{ opacity: 0, x: -22 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.55, ease: 'easeOut' }}
          >
            <span className="eyebrow">Internal operations</span>
            <h1>Everything your shop needs, in one place.</h1>
            <p>Manage serialized stock, pawn contracts, purchases, sales and customer records from one secure workspace.</p>
            <div className="auth-overview-list">
              <span><HandCoins size={18} /><b>Pawn desk</b><small>Contracts and repayments</small></span>
              <span><Boxes size={18} /><b>Live inventory</b><small>IMEI and stock tracking</small></span>
              <span><BadgeCheck size={18} /><b>Protected access</b><small>Staff roles and audit history</small></span>
            </div>
          </motion.aside>

          <motion.section
            className="auth-card"
            initial={{ opacity: 0, x: 22, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.55, ease: 'easeOut' }}
          >
            <header>
              <div>
                <h2>{setupRequired ? 'Create owner account' : 'Welcome back'}</h2>
                <p>{setupRequired ? 'Set up the owner account for this shop.' : 'Sign in to your PhoneFlow account.'}</p>
              </div>
              <span className="auth-security-mark"><BadgeCheck size={20} /></span>
            </header>
            {error && <ErrorNotice message={error} />}
            {setupRequired === null ? (
              <div className="loading-line">Checking secure connection…</div>
            ) : (
              <form className="form-stack" onSubmit={submit}>
                {setupRequired && <label>Owner name<input name="name" autoComplete="name" required placeholder="Shop owner" /></label>}
                <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="owner@shop.com" /></label>
                <label>Password<input name="password" type="password" autoComplete={setupRequired ? 'new-password' : 'current-password'} minLength={8} required placeholder="Enter your password" /></label>
                <button className="primary-button full-width" disabled={busy}>{busy ? 'Signing in…' : setupRequired ? 'Create shop account' : 'Sign in'}</button>
              </form>
            )}
            <div className="auth-features" aria-label="PhoneFlow features">
              <span><BadgeCheck size={15} /> Encrypted staff access</span>
              <span>PhoneFlow v0.2</span>
            </div>
          </motion.section>
        </div>
      </section>
    </main>
  )
}
