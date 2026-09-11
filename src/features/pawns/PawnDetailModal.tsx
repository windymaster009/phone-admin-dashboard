import { useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowUpRight, Printer, Trash2, X } from 'lucide-react'
import type { Pawn, PawnAction, PawnCurrency } from '../../types/domain'
import { dateText, pawnMoney } from '../../lib/presentation'
import MoneyInput from '../../components/MoneyInput'
import StatusBadge from '../../components/StatusBadge'
import KeyValueSummary from '../../components/KeyValueSummary'
import DetailModalShell from '../../components/DetailModalShell'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import { printInventoryLabel } from '../inventory/barcode'
import './pawn-management.css'

export function pawnOutstanding(pawn: Pawn) {
  if (pawn.feeModel === 'DAILY_SIMPLE' && pawn.feeSummary) return pawn.feeSummary.redemptionTotal
  return Math.max(0, (pawn.remainingPrincipal ?? pawn.principal) + (pawn.accruedInterest || 0) + (pawn.fees || 0))
}

export type PawnDetailModalProps = {
  pawn: Pawn
  onClose: () => void
  onOpenAll?: () => void
  onAction?: (action: PawnAction, payload: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
  canDelete?: boolean
  onOpenDocuments?: () => void
}

export default function PawnDetailModal({
  pawn,
  onClose,
  onOpenAll,
  onAction,
  onDelete,
  canDelete = false,
  onOpenDocuments,
}: PawnDetailModalProps) {
  const [action, setAction] = useState<PawnAction | null>(null)
  const [amount, setAmount] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [renewalTermDays, setRenewalTermDays] = useState('7')
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const outstanding = pawnOutstanding(pawn)
  const pawnCurrency: PawnCurrency = pawn.currency === 'KHR' ? 'KHR' : 'USD'
  const currencyLabel = pawnCurrency === 'KHR' ? 'KHR' : '$'
  const isOpen = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status)
  const deleteEligible = isOpen && !pawn.amountPaid && !(pawn.renewals?.length)
  const remainingPrincipal = pawn.remainingPrincipal ?? pawn.principal
  const currentFee = pawn.feeModel === 'DAILY_SIMPLE' ? pawn.feeSummary?.accruedFee || 0 : pawn.accruedInterest || 0
  const duePaymentRaw = currentFee + (pawn.fees || 0)
  const duePayment = pawnCurrency === 'KHR'
    ? Math.round(duePaymentRaw / 100) * 100
    : Math.round((duePaymentRaw + Number.EPSILON) * 100) / 100
  const dailyFeeRate = Number(pawn.dailyFeeRate || 2.5).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const dailyFeeAmount = pawn.feeSummary?.dailyFeeAmount ?? remainingPrincipal * Number(pawn.dailyFeeRate || 2.5) / 100
  const dayInMilliseconds = 86_400_000
  const dueDateMilliseconds = new Date(pawn.dueDate).getTime()
  const minimumClaimDateMilliseconds = dueDateMilliseconds + 5 * dayInMilliseconds
  const savedClaimDateMilliseconds = pawn.graceEndsAt ? new Date(pawn.graceEndsAt).getTime() : Number.NaN
  const claimAvailableAtMilliseconds = Number.isFinite(savedClaimDateMilliseconds)
    ? Math.max(minimumClaimDateMilliseconds, savedClaimDateMilliseconds)
    : dueDateMilliseconds + Math.max(2, Number(pawn.gracePeriodDays) || 0) * dayInMilliseconds
  const claimRecommendedByMilliseconds = dueDateMilliseconds + 7 * dayInMilliseconds
  const canClaimCollateral = pawn.status === 'OVERDUE' && Date.now() > claimAvailableAtMilliseconds
  const claimAvailableText = dateText(new Date(claimAvailableAtMilliseconds).toISOString())
  const claimRecommendedByText = dateText(new Date(claimRecommendedByMilliseconds).toISOString())

  const extensionBaseDate = Date.now()
  const countsStartDay = Number(pawn.workflowVersion) >= 5
  const renewalDays = Number(renewalTermDays || 0)
  const extensionDueDate = dateText(new Date(extensionBaseDate + renewalDays * dayInMilliseconds).toISOString())
  const pawnStartMilliseconds = new Date(pawn.startDate || pawn.createdAt).getTime()
  const elapsedContractDays = Number.isFinite(pawnStartMilliseconds)
    ? Math.max(0, Math.floor((extensionBaseDate - pawnStartMilliseconds) / dayInMilliseconds) + (countsStartDay ? 1 : 0))
    : Math.max(0, Number(pawn.feeSummary?.contractLengthDays || pawn.termDays) || 0)
  const extendedContractLengthDays = elapsedContractDays + renewalDays
  const enteredRedemptionAmount = action === 'redeem' ? Number(amount) : 0
  const redemptionExtra = action === 'redeem' && Number.isFinite(enteredRedemptionAmount)
    ? Math.max(0, enteredRedemptionAmount - outstanding)
    : 0

  function handleOpenDocuments() {
    if (onOpenDocuments) {
      onOpenDocuments()
      return
    }
    window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
      detail: { sourceType: 'PAWN', reference: pawn.pawnNo },
    }))
  }

  function printPawnTicket(sourceSubId = 'latest-contract') {
    window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-ticket', {
      detail: { reference: pawn.pawnNo, sourceSubId },
    }))
  }

  function printPawnProductLabel() {
    const linkedItem = typeof pawn.inventoryItem === 'object' ? pawn.inventoryItem : null
    if (!linkedItem?.sku) {
      window.alert('This pawn is not linked to an inventory label yet. Refresh Pawn Management and try again.')
      return
    }
    printInventoryLabel({
      sku: linkedItem.sku,
      barcode: pawn.pawnNo,
      name: linkedItem.name || pawn.itemSnapshot.name,
      brand: linkedItem.brand || pawn.itemSnapshot.brand,
      model: [linkedItem.model || pawn.itemSnapshot.model, linkedItem.storage || pawn.itemSnapshot.storage, linkedItem.color || pawn.itemSnapshot.color].filter(Boolean).join(' '),
      imei1: linkedItem.imei1 || pawn.itemSnapshot.imei,
      sellPrice: 0,
    })
  }

  function openAction(nextAction: PawnAction) {
    setAction(nextAction)
    setActionError('')
    setNote('')
    setNewDueDate('')
    const initialRenewalTermDays = pawn.termDays || 7
    setRenewalTermDays(String(initialRenewalTermDays))
    const suggestedAmount = nextAction === 'redeem'
      ? outstanding
      : nextAction === 'renew'
        ? pawn.feeModel === 'DAILY_SIMPLE' ? null : (pawn.accruedInterest || 0) + (pawn.fees || 0)
        : nextAction === 'payment'
          ? duePayment
          : null
    setAmount(suggestedAmount === null ? '' : pawnCurrency === 'KHR' ? String(Math.round(suggestedAmount / 100) * 100) : suggestedAmount.toFixed(2))
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action || !onAction) return
    setActionBusy(true)
    setActionError('')
    try {
      const payload: Record<string, unknown> = { note }
      if (action !== 'forfeit' && !(action === 'renew' && pawn.feeModel === 'DAILY_SIMPLE')) payload.amount = Number(amount)
      if (action === 'renew') {
        if (pawn.feeModel === 'DAILY_SIMPLE') payload.termDays = Number(renewalTermDays)
        else payload.newDueDate = newDueDate
      }
      if (action === 'forfeit' && amount) payload.sellPrice = Number(amount)
      await onAction(action, payload)
      setAction(null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to update pawn contract')
    } finally {
      setActionBusy(false)
    }
  }

  async function deletePawn() {
    if (!onDelete) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await onDelete()
      setDeleteConfirmation(false)
      onClose()
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete this pawn contract')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <DetailModalShell
        onClose={onClose}
        titleId="pawn-detail-title"
        className="pawn-detail-modal"
      >
        <DetailModalHeader
          eyebrow="Pawn contract"
          title={pawn.pawnNo}
          titleId="pawn-detail-title"
          description={`${pawn.customer?.name || 'Unknown customer'} · ${pawn.itemSnapshot.name}`}
          badge={<StatusBadge status={pawn.status} />}
          onClose={onClose}
          closeLabel={`Close ${pawn.pawnNo}`}
        />

        <DetailModalBody className="pawn-detail-body">
          <section className="pawn-balance-summary" aria-label="Current pawn balance">
            <div className="pawn-balance-heading">
              <div>
                <span className="eyebrow">Current balance</span>
                <h4>Amount to redeem today</h4>
              </div>
              <StatusBadge status={pawn.status} />
            </div>
            <strong className="pawn-balance-total">{pawnMoney(outstanding, pawnCurrency)}</strong>
            <p>Return this amount to collect the pawned item today.</p>
            <KeyValueSummary
              columns={4}
              className="pawn-balance-breakdown"
              items={[
                { id: 'principal', label: 'Principal still owed', value: pawnMoney(remainingPrincipal, pawnCurrency) },
                { id: 'fee', label: 'Fee accumulated today', value: pawnMoney(currentFee, pawnCurrency) },
                { id: 'payments', label: 'Payments received', value: pawnMoney(pawn.amountPaid || 0, pawnCurrency) },
                { id: 'due', label: 'Payment due', value: dateText(pawn.dueDate) },
              ]}
            />
          </section>

          <div className="pawn-detail-groups">
            <section className="pawn-detail-group">
              <header>
                <span className="eyebrow">Loan agreement</span>
                <h4>Contract terms</h4>
              </header>
              <dl>
                <div><dt>Cash originally given</dt><dd>{pawnMoney(pawn.principal, pawnCurrency)}</dd></div>
                <div><dt>Estimated resale value</dt><dd>{pawnMoney(pawn.estimatedValue, pawnCurrency)}</dd></div>
                <div><dt>Loan-to-value</dt><dd>{pawn.pawnPercentage}%</dd></div>
                <div><dt>Currency</dt><dd>{pawnCurrency}</dd></div>
                <div><dt>{pawn.feeModel === 'DAILY_SIMPLE' ? 'Daily fee rate' : 'Interest rate'}</dt><dd>{pawn.feeModel === 'DAILY_SIMPLE' ? `${dailyFeeRate}% per day` : `${pawn.interestRate}%`}</dd></div>
                {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Total contract length</dt><dd>{pawn.feeSummary?.contractLengthDays ?? pawn.termDays} days</dd></div>}
              </dl>
            </section>

            <section className="pawn-detail-group">
              <header>
                <span className="eyebrow">Payment schedule</span>
                <h4>Dates and expected fee</h4>
              </header>
              <dl>
                <div><dt>Pawned on</dt><dd>{dateText(pawn.startDate || pawn.createdAt)}</dd></div>
                <div><dt>Due date</dt><dd>{dateText(pawn.dueDate)}</dd></div>
                {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Days accumulated</dt><dd>{pawn.feeSummary?.accruedDays || 0} days</dd></div>}
                {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Fee if paid on due date</dt><dd>{pawnMoney(pawn.feeSummary?.feeAtDueDate || 0, pawnCurrency)}</dd></div>}
                {pawn.feeModel === 'DAILY_SIMPLE' && <div className="pawn-total-at-due"><dt>Total to pay on due date</dt><dd>{pawnMoney(pawn.feeSummary?.totalAtDueDate || 0, pawnCurrency)}</dd></div>}
                {pawn.feeModel !== 'DAILY_SIMPLE' && <div><dt>Record created</dt><dd>{dateText(pawn.createdAt)}</dd></div>}
              </dl>
            </section>
          </div>

          <KeyValueSummary
            columns={2}
            className="pawn-verification-summary"
            aria-label="Contract verification"
            items={[
              { id: 'ownership', label: 'Item ownership', value: pawn.ownershipConfirmed || pawn.identificationVerified ? 'Confirmed by staff' : 'Legacy record' },
              { id: 'id', label: 'National ID', value: pawn.identificationVerified ? 'Recorded and verified' : 'Not recorded — optional' },
            ]}
          />

          {pawn.renewals && pawn.renewals.length > 0 && (
            <div className="detail-note pawn-renewal-history">
              <span className="eyebrow">Extension history</span>
              {pawn.renewals.map((renewal, index) => {
                const recordedPayment = renewal.feePaid ?? renewal.paymentAmount
                const ticketPart = renewal.ticketPart || index + 2
                return (
                  <div className="pawn-renewal-history-row" key={`${renewal.renewedAt}-${index}`}>
                    <p>
                      <strong>Part {ticketPart} · {dateText(renewal.renewedAt)}</strong> · {renewal.termDays ? `${renewal.termDays} days added` : 'Legacy extension'} · Total contract length {renewal.contractLengthDays ?? '—'} days · {recordedPayment ? `Payment recorded ${pawnMoney(recordedPayment, pawnCurrency)}` : 'No extension payment'} · {pawnMoney(renewal.dailyFeeAmount ?? dailyFeeAmount, pawnCurrency)} per day · New due {dateText(renewal.newDueDate)}
                      {renewal.renewedBy?.name ? ` · ${renewal.renewedBy.name}` : ''}
                    </p>
                    {renewal._id && (
                      <button
                        type="button"
                        className="ghost-button pawn-renewal-print"
                        onClick={() => printPawnTicket(`renewal:${renewal._id}`)}
                      >
                        Print Part {ticketPart}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="detail-sections">
            <article>
              <span className="eyebrow">Customer</span>
              <p><strong>{pawn.customer?.name || 'Unknown'}</strong></p>
              <p>{pawn.customer?.phone || 'No phone recorded'}</p>
              <p>{pawn.customer?.nationalIdNumber || 'No National ID recorded'}</p>
            </article>
            <article>
              <span className="eyebrow">Collateral</span>
              <p><strong>{pawn.itemSnapshot.name}</strong></p>
              <p>{[pawn.itemSnapshot.brand, pawn.itemSnapshot.model, pawn.itemSnapshot.storage, pawn.itemSnapshot.color].filter(Boolean).join(' ') || 'No extra device details'}</p>
              <p>{pawn.itemSnapshot.imei || 'No IMEI recorded'}</p>
            </article>
          </div>

          {pawn.notes && (
            <div className="detail-note">
              <span className="eyebrow">Notes</span>
              <p>{pawn.notes}</p>
            </div>
          )}

          {action && (
            <form className={`pawn-action-form ${action === 'renew' ? 'renew-action-form' : ''}`} onSubmit={submitAction}>
              <div className="pawn-action-header">
                <div>
                  <span className="eyebrow">
                    {action === 'payment' ? 'Due payment' : action === 'renew' ? 'Extend pawn' : action === 'redeem' ? 'Redeem collateral' : 'Claim collateral'}
                  </span>
                  <p>
                    {action === 'payment'
                      ? 'Pay the fee accumulated through today without reducing the principal.'
                      : action === 'renew'
                        ? pawn.feeModel === 'DAILY_SIMPLE'
                          ? 'Add more days to this pawn. This does not record another payment.'
                          : 'Clear the required fees and extend the contract due date.'
                        : action === 'redeem'
                          ? 'Confirm the amount collected and return the collateral to the customer.'
                          : 'Close this overdue contract and transfer the collateral into shop inventory.'}
                  </p>
                </div>
                <button type="button" className="icon-button" onClick={() => setAction(null)} aria-label="Cancel action">
                  <X size={15} />
                </button>
              </div>

              {actionError && <p className="pawn-action-error">{actionError}</p>}

              {action !== 'forfeit' && !(action === 'renew' && pawn.feeModel === 'DAILY_SIMPLE') && (
                <label className="pawn-action-amount">
                  <span>
                    {action === 'redeem' ? 'Redemption amount' : action === 'renew' ? 'Required fee payment' : 'Fee due today'}
                    {action === 'redeem' && <small>Minimum due: {pawnMoney(outstanding, pawnCurrency)}</small>}
                    {action === 'payment' && pawn.feeModel === 'DAILY_SIMPLE' && <small>{pawnMoney(dailyFeeAmount, pawnCurrency)} per day × {pawn.feeSummary?.accruedDays || 0} days</small>}
                  </span>
                  <div className="input-prefix">
                    <span>{currencyLabel}</span>
                    <MoneyInput
                      autoFocus
                      currency={pawnCurrency}
                      minimum={action === 'redeem' ? Math.max(outstanding, pawnCurrency === 'KHR' ? 100 : 0.01) : pawnCurrency === 'KHR' ? 100 : 0.01}
                      required
                      readOnly={action === 'payment'}
                      value={amount}
                      onValueChange={setAmount}
                      placeholder={pawnCurrency === 'KHR' ? '0' : '0.00'}
                    />
                  </div>
                  {action === 'redeem' && redemptionExtra > 0 && (
                    <small className="pawn-redemption-adjustment">
                      Additional amount collected above the calculated balance: {pawnMoney(redemptionExtra, pawnCurrency)}.
                    </small>
                  )}
                </label>
              )}

              {action === 'forfeit' && (
                <label>
                  <span>Selling price <small className="optional-marker">Optional</small></span>
                  <div className="input-prefix">
                    <span>{currencyLabel}</span>
                    <input
                      autoFocus
                      type="text"
                      inputMode={pawnCurrency === 'KHR' ? 'numeric' : 'decimal'}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(pawnCurrency === 'KHR' ? /\D/g : /[^0-9.]/g, ''))}
                      placeholder={String(pawn.estimatedValue)}
                    />
                  </div>
                </label>
              )}

              {action === 'forfeit' && (
                <div className="pawn-claim-confirmation" role="note">
                  <strong>Confirm this claim carefully</strong>
                  <span>The customer will no longer be able to redeem this contract, and the collateral will become shop inventory.</span>
                </div>
              )}

              {action === 'renew' && (pawn.feeModel === 'DAILY_SIMPLE' ? (
                <label className="pawn-renewal-term">
                  Days to add
                  <select autoFocus required value={renewalTermDays} onChange={(event) => setRenewalTermDays(event.target.value)}>
                    <option value="3">3 Days</option>
                    <option value="7">1 Week (7 days)</option>
                    <option value="15">Half Month (15 days)</option>
                    <option value="30">1 Month (30 days)</option>
                  </select>
                </label>
              ) : (
                <label>
                  New due date
                  <input type="date" required value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
                </label>
              ))}

              {action === 'renew' && pawn.feeModel === 'DAILY_SIMPLE' && (
                <div className="pawn-renewal-summary" aria-label="Extension summary">
                  <div><span>Contract length</span><strong>{elapsedContractDays} elapsed + {renewalTermDays} added = {extendedContractLengthDays} days</strong></div>
                  <div><span>New due date</span><strong>{extensionDueDate}</strong></div>
                  <div><span>Daily pawn fee</span><strong>{pawnMoney(dailyFeeAmount, pawnCurrency)} per day · {dailyFeeRate}%</strong></div>
                  <div><span>Next period fee</span><strong>{pawnMoney(dailyFeeAmount * Number(renewalTermDays || 0), pawnCurrency)} for {renewalTermDays} days</strong></div>
                </div>
              )}

              {action !== 'forfeit' && (
                <label className="pawn-action-note">
                  <span>Note <small className="optional-marker">Optional</small></span>
                  <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a reference or payment note" />
                </label>
              )}

              <div className="pawn-action-buttons">
                <button type="button" className="ghost-button" onClick={() => setAction(null)}>Cancel</button>
                <button
                  type="submit"
                  className={`primary-button ${action === 'forfeit' ? 'danger-button' : ''}`}
                  disabled={actionBusy || (action === 'payment' && duePayment <= 0)}
                >
                  {actionBusy ? 'Saving...' : action === 'payment' ? 'Save due payment' : action === 'renew' ? 'Confirm extension' : action === 'redeem' ? 'Confirm redemption' : 'Confirm claim'}
                </button>
              </div>
            </form>
          )}
        </DetailModalBody>

        {!action && (
          <DetailModalFooter
            banner={
              onAction && isOpen && pawn.status === 'OVERDUE' ? (
                <div className={`pawn-claim-action ${canClaimCollateral ? 'eligible' : ''}`} role="note">
                  <span>
                    <strong>{canClaimCollateral ? 'Claim is available' : `Claim available ${claimAvailableText}`}</strong>
                    <small>Recommended claim window: 5-7 days overdue{claimRecommendedByMilliseconds > claimAvailableAtMilliseconds ? `, by ${claimRecommendedByText}` : ''}.</small>
                  </span>
                  <button
                    type="button"
                    className="ghost-button danger-link"
                    onClick={() => openAction('forfeit')}
                    disabled={!canClaimCollateral}
                    title={canClaimCollateral ? 'Claim this collateral for shop inventory' : `Wait until ${claimAvailableText} to claim this collateral`}
                  >
                    Claim collateral
                  </button>
                </div>
              ) : null
            }
            utilityActions={
              <>
                <button
                  type="button"
                  className="secondary-button pawn-documents-action"
                  onClick={handleOpenDocuments}
                  title="View receipts, contracts, and documents"
                >
                  <Printer size={15} /> Documents
                </button>
                <button
                  type="button"
                  className="secondary-button pawn-label-print"
                  onClick={printPawnProductLabel}
                  title="Print the linked collateral inventory label"
                >
                  <Printer size={15} /> Print label
                </button>
              </>
            }
            destructiveAction={
              canDelete && onDelete ? (
                <button
                  type="button"
                  className="ghost-button danger-button pawn-delete-action"
                  onClick={() => { setDeleteError(''); setDeleteConfirmation(true) }}
                  disabled={!deleteEligible}
                  title={deleteEligible ? 'Permanently delete this untouched pawn contract' : 'Only an untouched open pawn contract can be deleted'}
                >
                  <Trash2 size={15} /> Delete contract
                </button>
              ) : null
            }
            secondaryActions={
              onOpenAll ? (
                <button type="button" className="secondary-button" onClick={onOpenAll}>
                  Open pawn management <ArrowUpRight size={15} />
                </button>
              ) : null
            }
            transactionActions={
              onAction && isOpen ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openAction('payment')}
                    disabled={duePayment <= 0}
                    title={duePayment <= 0 ? 'No fee is due today' : `Pay ${pawnMoney(duePayment, pawnCurrency)} due today`}
                  >
                    Due payment
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openAction('renew')}
                    disabled={pawn.feeModel === 'DAILY_SIMPLE' && duePayment > 0}
                    title={pawn.feeModel === 'DAILY_SIMPLE' && duePayment > 0 ? `Pay ${pawnMoney(duePayment, pawnCurrency)} due first` : 'Add more days to this pawn'}
                  >
                    Extend pawn
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openAction('redeem')}
                  >
                    Redeem item
                  </button>
                </>
              ) : null
            }
          />
        )}
      </DetailModalShell>

      {deleteConfirmation && (
        <DetailModalShell
          compact
          onClose={() => setDeleteConfirmation(false)}
          titleId="pawn-delete-title"
          className="pawn-delete-modal"
        >
          <DetailModalHeader
            eyebrow="Permanent deletion"
            title="Delete this pawn?"
            titleId="pawn-delete-title"
            description="This cannot be undone."
            onClose={() => setDeleteConfirmation(false)}
            closeLabel="Close delete confirmation"
          />
          <DetailModalBody className="pawn-delete-content">
            <span className="pawn-delete-icon"><Trash2 size={22} /></span>
            <div>
              <strong>{pawn.pawnNo}</strong>
              <p>{pawn.customer?.name || 'Unknown customer'} · {pawn.itemSnapshot.name}</p>
            </div>
            <p>The contract, its collateral item, and related receipts will be removed. The customer record will remain.</p>
            {deleteError && <p className="pawn-delete-error" role="alert"><AlertTriangle size={16} /> {deleteError}</p>}
          </DetailModalBody>
          <DetailModalFooter className="pawn-delete-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setDeleteConfirmation(false)}
              disabled={deleteBusy}
            >
              Keep contract
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => void deletePawn()}
              disabled={deleteBusy}
            >
              {deleteBusy ? 'Deleting...' : 'Delete permanently'}
            </button>
          </DetailModalFooter>
        </DetailModalShell>
      )}
    </>
  )
}
