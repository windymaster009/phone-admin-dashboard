import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpRight, BadgeCheck, Clock3, HandCoins, MoreHorizontal, Plus, RefreshCcw, ScanLine, Search } from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import type { Pawn, PawnAction } from '../../types/domain'
import { comingNext, dateText, money, pawnEquivalentText, pawnMoney, pawnUsdValue, useExchangeRate } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import PawnDetailModal, { pawnOutstanding } from './PawnDetailModal'
import './pawn-management.css'

export default function PawnView({ user }: { user: SessionUser }) {
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [pawnSort, setPawnSort] = useState<'newest' | 'oldest' | 'due-soonest' | 'due-latest'>('newest')
  const [error, setError] = useState('')
  const exchangeRate = useExchangeRate()

  useEffect(() => {
    api<{ pawns: Pawn[] }>('/pawns')
      .then((result) => setPawns(result.pawns))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  const visiblePawns = pawns
    .filter((pawn) => {
      if (statusFilter !== 'ALL' && pawn.status !== statusFilter) return false
      const query = searchTerm.trim().toLowerCase()
      if (!query) return true
      return [pawn.pawnNo, pawn.customer?.name, pawn.itemSnapshot.name, pawn.itemSnapshot.imei]
        .some((value) => value?.toLowerCase().includes(query))
    })
    .sort((a, b) => {
      if (pawnSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (pawnSort === 'due-soonest') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      if (pawnSort === 'due-latest') return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  async function updatePawn(action: PawnAction, payload: Record<string, unknown>) {
    if (!selectedPawn) return
    const result = await api<{ pawn: Pawn }>(`/pawns/${selectedPawn._id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const updatedPawn: Pawn = {
      ...result.pawn,
      inventoryItem: typeof result.pawn.inventoryItem === 'object'
        ? result.pawn.inventoryItem
        : selectedPawn.inventoryItem,
    }
    setPawns((current) => current.map((pawn) => pawn._id === updatedPawn._id ? updatedPawn : pawn))
    setSelectedPawn(updatedPawn)
    if (action === 'renew') {
      const latestRenewal = updatedPawn.renewals?.at(-1)
      const sourceSubId = latestRenewal?._id ? `renewal:${latestRenewal._id}` : 'latest-contract'
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-ticket', {
        detail: { reference: updatedPawn.pawnNo, sourceSubId },
      }))
    }
  }

  async function deletePawn() {
    if (!selectedPawn) return
    const pawnToDelete = selectedPawn
    await api<{ deleted: true; pawnNo: string }>(`/pawns/${pawnToDelete._id}`, { method: 'DELETE' })
    setPawns((current) => current.filter((pawn) => pawn._id !== pawnToDelete._id))
  }

  const openPawns = pawns.filter((pawn) => ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status))
  const openPawnUsdTotal = openPawns.reduce((sum, pawn) => sum + pawnUsdValue(pawn, pawn.remainingPrincipal ?? pawn.principal), 0)

  return (
    <>
      <div className="pawn-page-heading">
        <SectionHeader
          eyebrow="Operations"
          title="Pawn management"
          description={error || 'Track collateral, optional customer identification, due payments, extensions, and overdue contracts.'}
          action={<div className="section-header-actions pawn-header-actions">
            <button className="secondary-button pawn-scan-trigger" type="button" onClick={() => window.dispatchEvent(new Event('phoneflow:open-scanner'))} aria-label="Scan product"><ScanLine size={17} aria-hidden="true" /><span>Scan product</span></button>
            <button className="primary-button" onClick={() => comingNext('New pawn')}><Plus size={17} /> New pawn</button>
          </div>}
        />
      </div>
      <section className="mini-stats-grid pawn-stats-grid">
        <div className="surface-card mini-stat"><HandCoins /><p>Open contracts<strong>{openPawns.length}</strong><small>{money.format(openPawnUsdTotal)} USD equivalent remaining</small></p></div>
        <div className="surface-card mini-stat"><Clock3 /><p>Due soon<strong>{pawns.filter((pawn) => pawn.status === 'DUE_SOON').length}</strong><small>needs follow-up</small></p></div>
        <div className="surface-card mini-stat"><AlertTriangle /><p>Overdue<strong>{pawns.filter((pawn) => pawn.status === 'OVERDUE').length}</strong><small>past due contracts</small></p></div>
        <div className="surface-card mini-stat"><RefreshCcw /><p>Extended contracts<strong>{pawns.filter((pawn) => (pawn.renewals?.length || 0) > 0).length}</strong><small>contracts with extension history</small></p></div>
      </section>
      <article className="surface-card table-card page-table pawn-workspace-card">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search contract, customer, phone or IMEI" /></div>
          <select className="ghost-button filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter pawn status">
            <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="REDEEMED">Redeemed</option><option value="FORFEITED">Claimed</option>
          </select>
          <select className="ghost-button filter-select" value={pawnSort} onChange={(event) => setPawnSort(event.target.value as 'newest' | 'oldest' | 'due-soonest' | 'due-latest')} aria-label="Sort pawn contracts">
            <option value="newest">Newest contracts</option><option value="oldest">Oldest contracts</option><option value="due-soonest">Due soonest</option><option value="due-latest">Due latest</option>
          </select>
        </div>
        <div className="table-scroll pawn-management-table">
          <table>
            <thead><tr><th>Contract</th><th>Customer</th><th>Collateral</th><th>Estimated value</th><th>Loan</th><th>ID card</th><th>Due date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {visiblePawns.map((row) => (
                <tr key={row._id}>
                  <td><strong className="mono">{row.pawnNo}</strong></td>
                  <td>{row.customer?.name || 'Unknown'}</td>
                  <td>{row.itemSnapshot.name}<small className="table-subtext">{row.itemSnapshot.imei || 'No IMEI'}</small></td>
                  <td>{pawnMoney(row.estimatedValue, row.currency)}</td>
                  <td><strong>{pawnMoney(row.remainingPrincipal ?? row.principal, row.currency)}</strong>{row.feeModel === 'DAILY_SIMPLE' && <small className="table-subtext">Fee today {pawnMoney(row.feeSummary?.accruedFee || 0, row.currency)}</small>}</td>
                  <td>{row.identificationVerified ? <span className="verified"><BadgeCheck size={15} /> Verified</span> : <span className="pawn-id-optional">Not provided</span>}</td>
                  <td>{dateText(row.dueDate)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View ${row.pawnNo}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {loading && <tr><td colSpan={9}><LoadingState compact label="Loading pawn contracts" detail="Checking balances, fees, and due dates…" /></td></tr>}
              {!loading && visiblePawns.length === 0 && <tr><td colSpan={9}>No pawn contracts match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mobile-contract-list pawn-management-mobile-list">
          {visiblePawns.map((row) => (
            <article className="mobile-contract-card" key={row._id}>
              <div className="mobile-contract-heading">
                <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                <p><strong>{row.customer?.name || 'Unknown'}</strong><small>{row.itemSnapshot.name} · {row.pawnNo}</small></p>
                <StatusBadge status={row.status} />
              </div>
              <div className="mobile-contract-details">
                <div><span>Due now</span><strong>{pawnMoney(pawnOutstanding(row), row.currency)}</strong><small>{exchangeRate && pawnEquivalentText(pawnOutstanding(row), row.currency || 'USD', exchangeRate, row.exchangeRate)}</small></div>
                <div><span>Due date</span><strong>{dateText(row.dueDate)}</strong><small className={row.identificationVerified ? 'verified' : 'pawn-id-optional'}>{row.identificationVerified ? <><BadgeCheck size={11} /> ID verified</> : 'ID not provided'}</small></div>
                <button className="icon-button mobile-contract-open" onClick={() => setSelectedPawn(row)} aria-label={`View contract ${row.pawnNo}`}><MoreHorizontal size={18} /></button>
              </div>
            </article>
          ))}
          {loading && <LoadingState compact label="Loading pawn contracts" />}
          {!loading && visiblePawns.length === 0 && <p className="mobile-contract-empty">No pawn contracts match these filters.</p>}
        </div>
      </article>
      {selectedPawn && <PawnDetailModal pawn={selectedPawn} onClose={() => setSelectedPawn(null)} onAction={updatePawn} canDelete={user.role === 'OWNER'} onDelete={deletePawn} />}
    </>
  )
}
