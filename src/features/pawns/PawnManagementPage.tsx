import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, ArrowUpRight, BadgeCheck, Clock3, HandCoins, MoreHorizontal, Plus, RefreshCcw } from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import type { Pawn, PawnAction } from '../../types/domain'
import { comingNext, dateText, money, pawnEquivalentText, pawnMoney, pawnUsdValue, useExchangeRate } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import SummaryStats from '../../components/SummaryStats'
import FilterToolbar from '../../components/FilterToolbar'
import ScannerTriggerButton, { openProductScanner } from '../../components/scanner/ScannerTriggerButton'
import NotificationToast from '../../components/NotificationToast'
import PawnDetailModal, { pawnOutstanding } from './PawnDetailModal'
import { PAWN_CREATED_EVENT, type PawnCreatedEventDetail } from './pawnEvents'
import './pawn-management.css'

export default function PawnView({ user }: { user: SessionUser }) {
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [pawnSort, setPawnSort] = useState<'newest' | 'oldest' | 'due-soonest' | 'due-latest'>('newest')
  const [error, setError] = useState('')
  const [detailRefreshError, setDetailRefreshError] = useState('')
  const [successToast, setSuccessToast] = useState('')
  const exchangeRate = useExchangeRate()
  const updatingPawnRef = useRef(false)
  const deletingPawnRef = useRef(false)
  const detailRefreshRequestRef = useRef(0)
  const selectedPawnId = selectedPawn?._id

  useEffect(() => {
    api<{ pawns: Pawn[] }>('/pawns')
      .then(async (result) => {
        const list = Array.isArray(result?.pawns) ? result.pawns : []
        setPawns(list)
        const openParam = new URLSearchParams(window.location.search).get('openPawn')
        if (openParam) {
          const matched = list.find((p) => p._id === openParam || p.pawnNo === openParam)
            || (await api<{ pawn: Pawn }>(`/pawns/${encodeURIComponent(openParam)}`)).pawn
          if (matched) {
            setSelectedPawn(matched)
            window.history.replaceState(window.history.state, '', window.location.pathname)
          }
        }
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleOpenPawnDetail(event: Event) {
      const detail = (event as CustomEvent<{ pawn?: Pawn; id?: string; pawnNo?: string }>).detail
      let pawn = detail?.pawn
      if (!pawn && (detail?.id || detail?.pawnNo)) {
        pawn = pawns.find((p) => p._id === detail.id || p.pawnNo === detail.pawnNo || p._id === detail.pawnNo)
      }
      if (pawn) {
        setSelectedPawn(pawn)
        if (new URLSearchParams(window.location.search).has('openPawn')) {
          window.history.replaceState(window.history.state, '', window.location.pathname)
        }
      } else if (detail?.id) {
        void api<{ pawn: Pawn }>(`/pawns/${encodeURIComponent(detail.id)}`)
          .then((result) => {
            setSelectedPawn(result.pawn)
            window.history.replaceState(window.history.state, '', window.location.pathname)
          })
          .catch((reason: Error) => setError(reason.message))
      }
    }

    window.addEventListener('phoneflow:open-pawn-detail', handleOpenPawnDetail)
    return () => window.removeEventListener('phoneflow:open-pawn-detail', handleOpenPawnDetail)
  }, [pawns])

  useEffect(() => {
    const addCreatedPawn = (event: Event) => {
      const createdPawn = (event as CustomEvent<PawnCreatedEventDetail>).detail?.pawn
      if (!createdPawn?._id) return

      setPawns((current) => [
        createdPawn,
        ...current.filter((pawn) => pawn._id !== createdPawn._id),
      ])
      setError('')
    }

    window.addEventListener(PAWN_CREATED_EVENT, addCreatedPawn)
    return () => window.removeEventListener(PAWN_CREATED_EVENT, addCreatedPawn)
  }, [])

  useEffect(() => {
    if (!selectedPawnId) return
    let disposed = false
    setDetailRefreshError('')

    const refreshSelectedPawn = () => {
      if (document.visibilityState === 'hidden' || updatingPawnRef.current) return
      const request = ++detailRefreshRequestRef.current
      void api<{ pawn: Pawn }>(`/pawns/${encodeURIComponent(selectedPawnId)}`)
        .then((result) => {
          if (disposed || request !== detailRefreshRequestRef.current || result.pawn?._id !== selectedPawnId) return
          setPawns((current) => current.map((pawn) => pawn._id === selectedPawnId ? result.pawn : pawn))
          setSelectedPawn((current) => current?._id === selectedPawnId ? result.pawn : current)
          setDetailRefreshError('')
        })
        .catch((reason: Error) => {
          if (!disposed && request === detailRefreshRequestRef.current) setDetailRefreshError(`Current balance could not be refreshed: ${reason.message}`)
        })
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshSelectedPawn()
    }

    refreshSelectedPawn()
    const timer = window.setInterval(refreshSelectedPawn, 60_000)
    window.addEventListener('focus', refreshSelectedPawn)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      disposed = true
      ++detailRefreshRequestRef.current
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshSelectedPawn)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [selectedPawnId])

  const visiblePawns = pawns
    .filter((pawn) => {
      if (statusFilter !== 'ALL' && pawn.status !== statusFilter) return false
      const tokens = searchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      if (tokens.length === 0) return true
      const searchable = [pawn.pawnNo, pawn.customer?.name, pawn.customer?.phone, pawn.itemSnapshot?.name, pawn.itemSnapshot?.imei]
        .filter(Boolean).join(' ').toLocaleLowerCase()
      return tokens.every((token) => searchable.includes(token))
    })
    .sort((a, b) => {
      if (pawnSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (pawnSort === 'due-soonest') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      if (pawnSort === 'due-latest') return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  async function updatePawn(action: PawnAction, payload: Record<string, unknown>) {
    if (updatingPawnRef.current || !selectedPawn) return
    updatingPawnRef.current = true
    ++detailRefreshRequestRef.current
    try {
      const headers: Record<string, string> = {}
      if (typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) {
        headers['Idempotency-Key'] = payload.idempotencyKey
      }
      const result = await api<{ pawn: Pawn }>(`/pawns/${selectedPawn._id}/${action}`, {
        method: 'POST',
        headers,
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
    } finally {
      updatingPawnRef.current = false
    }
  }

  async function deletePawn() {
    if (deletingPawnRef.current || !selectedPawn) return
    deletingPawnRef.current = true
    try {
      const pawnToDelete = selectedPawn
      await api<{ deleted: true; pawnNo: string }>(`/pawns/${pawnToDelete._id}`, { method: 'DELETE' })
      setPawns((current) => current.filter((pawn) => pawn._id !== pawnToDelete._id))
      setSuccessToast('Pawn contract deleted successfully.')
    } finally {
      deletingPawnRef.current = false
    }
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
            <ScannerTriggerButton label="Scan product" className="pawn-scan-trigger" onClick={openProductScanner} />
            <button className="primary-button" onClick={() => comingNext('New pawn')}><Plus size={17} /> New pawn</button>
          </div>}
        />
      </div>
      <SummaryStats
        label="Pawn contract summary"
        items={[
          { label: 'Open contracts', value: openPawns.length, detail: `${money.format(openPawnUsdTotal)} USD equivalent remaining`, icon: HandCoins, tone: 'violet' },
          { label: 'Due soon', value: pawns.filter((pawn) => pawn.status === 'DUE_SOON').length, detail: 'needs follow-up', icon: Clock3, tone: 'orange' },
          { label: 'Overdue', value: pawns.filter((pawn) => pawn.status === 'OVERDUE').length, detail: 'past due contracts', icon: AlertTriangle, tone: 'rose' },
          { label: 'Extended contracts', value: pawns.filter((pawn) => (pawn.renewals?.length || 0) > 0).length, detail: 'contracts with extension history', icon: RefreshCcw, tone: 'blue' },
        ]}
      />
      <article className="surface-card table-card page-table pawn-workspace-card">
        <FilterToolbar
          className="pawn-filter-row"
          search={searchTerm}
          onSearchChange={setSearchTerm}
          searchLabel="Search pawn contracts"
          placeholder="Search contract, customer, phone or IMEI"
        >
          <select className="ghost-button filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter pawn status">
            <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="REDEEMED">Redeemed</option><option value="FORFEITED">Claimed</option>
          </select>
          <select className="ghost-button filter-select" value={pawnSort} onChange={(event) => setPawnSort(event.target.value as 'newest' | 'oldest' | 'due-soonest' | 'due-latest')} aria-label="Sort pawn contracts">
            <option value="newest">Newest contracts</option><option value="oldest">Oldest contracts</option><option value="due-soonest">Due soonest</option><option value="due-latest">Due latest</option>
          </select>
        </FilterToolbar>
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
      {selectedPawn && (
        <PawnDetailModal
          pawn={selectedPawn}
          quoteError={detailRefreshError}
          onClose={() => setSelectedPawn(null)}
          onAction={updatePawn}
          onRepawn={user.role === 'OWNER' || user.role === 'MANAGER' ? () => {
            const linkedItem = typeof selectedPawn.inventoryItem === 'object' ? selectedPawn.inventoryItem : null
            const imei = [linkedItem?.imei1, selectedPawn.itemSnapshot.imei]
              .find((candidate) => /^\d{15}$/.test(candidate || '')) || ''
            const pawnNo = selectedPawn.pawnNo
            const customerId = selectedPawn.customer?._id || ''
            setSelectedPawn(null)
            window.dispatchEvent(new CustomEvent('phoneflow:open-operation', {
              detail: {
                kind: 'pawn', repawnImei: imei, repawnPawnNo: pawnNo,
                repawnCustomerId: customerId,
                repawnCustomerMode: customerId ? 'EXISTING' : selectedPawn.customerSnapshot?.type === 'WALK_IN' ? 'WALK_IN' : 'NEW',
                repawnCustomerName: selectedPawn.customerSnapshot?.name || selectedPawn.customer?.name || '',
                repawnCustomerPhone: selectedPawn.customerSnapshot?.phone || selectedPawn.customer?.phone || '',
                repawnEstimatedValue: selectedPawn.estimatedValue,
                repawnCurrency: selectedPawn.currency || 'USD',
              },
            }))
          } : undefined}
          canDelete={user.role === 'OWNER'}
          canClaim={user.role === 'OWNER' || user.role === 'MANAGER'}
          onDelete={deletePawn}
        />
      )}
      <NotificationToast message={successToast} onDismiss={() => setSuccessToast('')} />
    </>
  )
}
