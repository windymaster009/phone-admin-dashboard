import { useState } from 'react'
import { BadgeCheck, Calculator, Database, LogOut, Settings, Smartphone, Server, ShieldAlert, Trash2, Type, UserRound } from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import { titleStatus } from '../../lib/presentation'
import SectionHeader from '../../components/SectionHeader'
import NotificationToast from '../../components/NotificationToast'
import PrintingSettings from './PrintingSettings'
import { getStoredValuations, clearStoredValuations } from '../../lib/storage'
import type { AppFontSize } from '../../app/types'
import './settings-page.css'

export default function SettingsView({
  user,
  onLogout,
  fontSize,
  onFontSizeChange,
}: {
  user: SessionUser
  onLogout: () => void
  fontSize: AppFontSize
  onFontSizeChange: (fontSize: AppFontSize) => void
}) {
  const [savedValuations, setSavedValuations] = useState<unknown[]>(getStoredValuations)
  const [toastMessage, setToastMessage] = useState('')
  const [purgingActivity, setPurgingActivity] = useState(false)

  const handlePurgeExpiredActivity = async () => {
    if (!window.confirm('Are you sure you want to purge expired activity records? Only records older than their configured retention threshold (expiresAt <= now) will be removed.')) {
      return
    }

    try {
      setPurgingActivity(true)
      const result = await api<{ success: boolean; deletedCount: number; message: string }>(
        '/settings/purge-expired-activity',
        { method: 'POST' }
      )
      setToastMessage(result.message || 'Expired activity records purged successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purge expired activity'
      setToastMessage(message)
    } finally {
      setPurgingActivity(false)
    }
  }

  const fontSizeOptions: Array<{
    value: AppFontSize
    label: string
    percentage: string
    description: string
  }> = [
    { value: 'default', label: 'Default', percentage: '100%', description: 'Standard dashboard size' },
    { value: 'comfortable', label: 'Comfortable', percentage: '110%', description: 'Larger text and controls' },
    { value: 'large', label: 'Large', percentage: '120%', description: 'Maximum readable size' },
  ]

  return (
    <>
      <SectionHeader eyebrow="System" title="System settings" description="Current account, environment, security, and local app preferences." />
      <section className="settings-grid">
        <div className="settings-column settings-primary-column">
        <article className="surface-card settings-card account-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon violet"><UserRound size={20} /></span>
            <div>
              <h3>Account profile</h3>
              <p>Your signed-in account and access details.</p>
            </div>
            <span className={`account-status ${user.active ? 'active' : 'disabled'}`}>
              <i />{user.active ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="account-settings-body">
            <div className="account-profile">
              <div className="settings-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
              <div className="account-identity">
                <h4>{user.name}</h4>
                <span>{user.email}</span>
              </div>
            </div>

            <div className="account-details">
              <div><span>Role</span><strong>{titleStatus(user.role)}</strong></div>
              <div><span>Access level</span><strong>{user.role === 'OWNER' ? 'Full access' : 'Role based'}</strong></div>
              <div><span>Authentication</span><strong>Password protected</strong></div>
            </div>
          </div>

          <div className="settings-card-footer">
            <p>Signing out will end your current session on this device.</p>
            <button className="ghost-button danger-button" onClick={onLogout}><LogOut size={15} />Log out</button>
          </div>
        </article>

        <PrintingSettings />

        <article className="surface-card settings-card font-size-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon violet"><Type size={20} /></span>
            <div>
              <h3>Display size</h3>
              <p>Make text and controls easier to read.</p>
            </div>
          </div>
          <div className="font-size-options" role="radiogroup" aria-label="Display size">
            {fontSizeOptions.map((option) => {
              const selected = option.value === fontSize
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`font-size-option ${selected ? 'active' : ''}`}
                  key={option.value}
                  onClick={() => onFontSizeChange(option.value)}
                >
                  <span className="font-size-preview" data-size={option.value} aria-hidden="true">Aa</span>
                  <span className="font-size-option-copy">
                    <span><strong>{option.label}</strong><b>{option.percentage}</b></span>
                    <small>{option.description}</small>
                  </span>
                  {selected && <BadgeCheck size={18} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <p className="font-size-setting-note">Saved on this browser and applied immediately.</p>
        </article>
        </div>

        <div className="settings-column settings-secondary-column">

        <article className="surface-card settings-card environment-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon blue"><Settings size={20} /></span>
            <div>
              <h3>App environment</h3>
              <p>Services currently powering PhoneFlow.</p>
            </div>
          </div>
          <div className="environment-list">
            <div>
              <span className="environment-icon"><Smartphone size={17} /></span>
              <p><strong>Frontend</strong><small>Vite local application</small></p>
              <span className="service-state"><i />Online</span>
            </div>
            <div>
              <span className="environment-icon"><Server size={17} /></span>
              <p><strong>API service</strong><small>Proxied securely through /api</small></p>
              <span className="service-state"><i />Connected</span>
            </div>
            <div>
              <span className="environment-icon"><Database size={17} /></span>
              <p><strong>Database</strong><small>MongoDB Atlas</small></p>
              <span className="service-state"><i />Connected</span>
            </div>
          </div>
        </article>

        {user.role === 'OWNER' && (
          <article className="surface-card settings-card retention-settings-card">
            <div className="settings-card-heading">
              <span className="settings-icon rose"><ShieldAlert size={20} /></span>
              <div>
                <h3>Activity log retention</h3>
                <p>Configured database retention and maintenance policies.</p>
              </div>
            </div>
            <div className="environment-list">
              <div>
                <p>
                  <strong>Operational activity</strong>
                  <small>Auto-expires after 90 days (configurable via env)</small>
                </p>
                <span className="service-state"><i />90 days</span>
              </div>
              <div>
                <p>
                  <strong>Security & auth sessions</strong>
                  <small>Auto-expires after 180 days (configurable via env)</small>
                </p>
                <span className="service-state"><i />180 days</span>
              </div>
            </div>
            <div className="settings-card-footer">
              <p>Purging only removes audit records older than their retention threshold.</p>
              <button
                type="button"
                className="ghost-button danger-button"
                disabled={purgingActivity}
                onClick={() => void handlePurgeExpiredActivity()}
              >
                <Trash2 size={15} />
                {purgingActivity ? 'Purging…' : 'Purge expired records'}
              </button>
            </div>
          </article>
        )}

        <article className="surface-card settings-card valuation-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon orange"><Calculator size={20} /></span>
            <div>
              <h3>Saved valuations</h3>
              <p>Calculator records stored on this device.</p>
            </div>
          </div>
          <div className="saved-valuation-summary">
            <strong>{savedValuations.length}</strong>
            <p>Saved record{savedValuations.length === 1 ? '' : 's'}<small>Local browser storage</small></p>
          </div>
          <div className="settings-card-footer">
            <p>Clearing local records cannot be undone.</p>
            <button
              className="ghost-button danger-button"
              disabled={savedValuations.length === 0}
              onClick={() => {
                clearStoredValuations()
                setSavedValuations([])
                setToastMessage('Saved valuations cleared successfully.')
              }}
            >
              <Trash2 size={15} />Clear records
            </button>
          </div>
        </article>
        </div>
      </section>
      <NotificationToast message={toastMessage} onDismiss={() => setToastMessage('')} />
    </>
  )
}

