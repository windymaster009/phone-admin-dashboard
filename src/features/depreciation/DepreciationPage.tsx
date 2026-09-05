import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calculator, FileText, HandCoins, ScanLine } from 'lucide-react'
import type { PawnCurrency, Pawn } from '../../types/domain'
import { currency, money, riel, pawnMoney, pawnEquivalentText, useExchangeRate } from '../../lib/presentation'
import MoneyInput from '../../components/MoneyInput'
import SectionHeader from '../../components/SectionHeader'
import { getStoredValuations, setStoredValuations, safeStorage } from '../../lib/storage'
import { getPawnAutoCalculatePreference, PAWN_AUTO_CALCULATE_EVENT, savePawnAutoCalculatePreference } from '../../lib/pawnPreferences'
import type { RouteKey } from '../../app/routing'
import './depreciation-page.css'

type NavKey = RouteKey

export default function DepreciationView({ goTo }: { goTo: (key: NavKey) => void }) {
  const [autoCalculate, setAutoCalculate] = useState(getPawnAutoCalculatePreference)
  const [valuationCurrency, setValuationCurrency] = useState<PawnCurrency>('USD')
  const [marketPrice, setMarketPrice] = useState(500)
  const [ageMonths, setAgeMonths] = useState(12)
  const [condition, setCondition] = useState('good')
  const [batteryHealth, setBatteryHealth] = useState(85)
  const [lockStatus, setLockStatus] = useState('unlocked')
  const [includedAccessories, setIncludedAccessories] = useState<string[]>(['BOX', 'CHARGER', 'CABLE'])
  const [repairCost, setRepairCost] = useState(0)
  const [pawnRate, setPawnRate] = useState(45)
  const exchangeRate = useExchangeRate()

  useEffect(() => {
    const syncPreference = (event: Event) => setAutoCalculate((event as CustomEvent<boolean>).detail)
    window.addEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
    return () => window.removeEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
  }, [])

  function changeValuationCurrency(nextCurrency: PawnCurrency) {
    if (nextCurrency === valuationCurrency || !exchangeRate) return
    const convert = (amount: number) => nextCurrency === 'KHR'
      ? Math.round((amount * exchangeRate.usdKhr) / 100) * 100
      : Math.round((amount / exchangeRate.usdKhr) * 100) / 100
    setMarketPrice(convert(marketPrice))
    setRepairCost(convert(repairCost))
    setValuationCurrency(nextCurrency)
  }

  const result = useMemo(() => {
    const conditionRates: Record<string, number> = {
      excellent: 0.05,
      good: 0.12,
      fair: 0.22,
      damaged: 0.4,
    }
    const ageRate = Math.min(Math.max(ageMonths, 0) * 0.0125, 0.5)
    const conditionRate = conditionRates[condition] ?? 0.12
    const batteryRate = batteryHealth >= 85 ? 0 : batteryHealth >= 80 ? 0.04 : batteryHealth >= 70 ? 0.08 : 0.12
    const essentialAccessories = includedAccessories.filter((accessory) => ['BOX', 'CHARGER', 'CABLE'].includes(accessory))
    const accessoryRate = essentialAccessories.length === 0
      ? 0.05
      : !includedAccessories.includes('CHARGER') || !includedAccessories.includes('CABLE')
        ? 0.03
        : !includedAccessories.includes('BOX') ? 0.01 : 0
    const carrierLockRate = lockStatus === 'carrier_locked' ? 0.1 : 0
    const eligible = lockStatus !== 'activation_locked'
    const roundAmount = (amount: number) => valuationCurrency === 'KHR'
      ? Math.round(amount / 100) * 100
      : Math.round((amount + Number.EPSILON) * 100) / 100
    const rawAgeDeduction = marketPrice * ageRate
    const rawConditionDeduction = marketPrice * conditionRate
    const rawBatteryDeduction = marketPrice * batteryRate
    const rawAccessoryDeduction = marketPrice * accessoryRate
    const rawCarrierLockDeduction = marketPrice * carrierLockRate
    const ageDeduction = roundAmount(rawAgeDeduction)
    const conditionDeduction = roundAmount(rawConditionDeduction)
    const batteryDeduction = roundAmount(rawBatteryDeduction)
    const accessoryDeduction = roundAmount(rawAccessoryDeduction)
    const carrierLockDeduction = roundAmount(rawCarrierLockDeduction)
    const calculatedEstimatedValue = roundAmount(eligible
      ? Math.max(marketPrice - rawAgeDeduction - rawConditionDeduction - rawBatteryDeduction - rawAccessoryDeduction - rawCarrierLockDeduction - Math.max(repairCost, 0), 0)
      : 0)
    const estimatedValue = autoCalculate
      ? calculatedEstimatedValue
      : roundAmount(eligible ? Math.max(marketPrice, 0) : 0)
    const maximumPawn = roundAmount(estimatedValue * (pawnRate / 100))
    return {
      eligible,
      ageRate,
      conditionRate,
      batteryRate,
      ageDeduction,
      conditionDeduction,
      batteryDeduction,
      accessoryDeduction,
      carrierLockDeduction,
      estimatedValue,
      maximumPawn,
      riskReserve: roundAmount(estimatedValue - maximumPawn),
    }
  }, [ageMonths, autoCalculate, batteryHealth, condition, includedAccessories, lockStatus, marketPrice, pawnRate, repairCost, valuationCurrency])

  function toggleAutoCalculate() {
    savePawnAutoCalculatePreference(!autoCalculate)
  }

  function saveValuation() {
    const record = {
      id: `VAL-${Date.now()}`,
      source: 'CALCULATOR',
      calculationMode: autoCalculate ? 'AUTO' : 'MANUAL',
      createdAt: new Date().toISOString(),
      currency: valuationCurrency,
      exchangeRate: valuationCurrency === 'KHR' ? exchangeRate?.usdKhr : 1,
      marketPrice,
      ageMonths,
      condition,
      batteryHealth,
      lockStatus,
      accessoriesIncluded: includedAccessories,
      repairCost,
      pawnRate,
      eligible: result.eligible,
      ageDeduction: result.ageDeduction,
      conditionDeduction: result.conditionDeduction,
      batteryDeduction: result.batteryDeduction,
      accessoryDeduction: result.accessoryDeduction,
      carrierLockDeduction: result.carrierLockDeduction,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
      usdKhrRate: exchangeRate?.usdKhr,
    }
    const previous = getStoredValuations()
    setStoredValuations([record, ...previous].slice(0, 50))
    window.alert('Valuation saved on this device.')
  }

  function useForPawn() {
    const valuation = {
      id: `VAL-${Date.now()}`,
      source: 'CALCULATOR',
      calculationMode: autoCalculate ? 'AUTO' : 'MANUAL',
      createdAt: new Date().toISOString(),
      currency: valuationCurrency,
      exchangeRate: valuationCurrency === 'KHR' ? exchangeRate?.usdKhr : 1,
      marketPrice,
      ageMonths,
      condition,
      batteryHealth,
      lockStatus,
      accessoriesIncluded: includedAccessories,
      repairCost,
      pawnRate,
      eligible: result.eligible,
      ageDeduction: result.ageDeduction,
      conditionDeduction: result.conditionDeduction,
      batteryDeduction: result.batteryDeduction,
      accessoryDeduction: result.accessoryDeduction,
      carrierLockDeduction: result.carrierLockDeduction,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
      usdKhrRate: exchangeRate?.usdKhr,
    }
    safeStorage.setJSON('phoneflow_last_valuation', valuation, 'session')
    goTo('pawn')
    window.dispatchEvent(new CustomEvent('phoneflow:open-pawn', { detail: { valuationId: valuation.id } }))
  }

  return (
    <>
      <div className="depreciation-page-heading">
        <SectionHeader
          eyebrow="Pawn valuation"
          title="Phone pawn offer calculator"
          description="Start with a verified resale price, deduct device risks and costs, then apply the shop's safe lending percentage."
        />
      </div>
      <section className="calculator-layout">
        <article className="surface-card calculator-card">
          <div className="card-heading"><div><span className="eyebrow">Collateral assessment</span><h3>Assess the phone</h3></div><div className="calculation-heading-actions"><button type="button" className={`calculation-mode-toggle ${autoCalculate ? 'active' : ''}`} role="switch" aria-checked={autoCalculate} onClick={toggleAutoCalculate}><span aria-hidden="true" /><strong>Auto calculate</strong><small>{autoCalculate ? 'On' : 'Off'}</small></button><span className="calculator-mark"><Calculator size={20} /></span></div></div>

          <div className="calculator-section">
            <div className="calculator-section-heading"><strong>1. Resale value</strong><small>Use a recent second-hand selling price, not the original retail price.</small></div>
            <div className="form-grid calculator-resale-grid">
              <label><span>Valuation currency</span><select value={valuationCurrency} onChange={(event) => changeValuationCurrency(event.target.value as PawnCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR" disabled={!exchangeRate}>KHR — Cambodian Riel</option></select></label>
              <label><span>Resale value</span><div className="input-prefix"><span>{valuationCurrency}</span><MoneyInput currency={valuationCurrency} value={marketPrice} onValueChange={(value) => setMarketPrice(Number(value))} /></div></label>
              <label><span>Phone age</span><div className="input-suffix"><input type="number" min="0" max="120" value={ageMonths} onChange={(event) => setAgeMonths(Number(event.target.value))} /><span>months</span></div></label>
              <label><span>Physical condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="excellent">Excellent / Like new</option><option value="good">Good / Minor wear</option><option value="fair">Fair / Visible wear</option><option value="damaged">Damaged / Repair needed</option></select></label>
              <label><span>Battery health</span><div className="input-suffix"><input type="number" min="0" max="100" value={batteryHealth} onChange={(event) => setBatteryHealth(Math.min(100, Math.max(0, Number(event.target.value))))} /><span>%</span></div></label>
            </div>
          </div>

          <div className="calculator-section">
            <div className="calculator-section-heading"><strong>2. Risk and costs</strong><small>Locked devices and hidden repair costs can remove the shop's safety margin.</small></div>
            <div className="form-grid calculator-risk-grid">
              <label><span>Lock status</span><select value={lockStatus} onChange={(event) => setLockStatus(event.target.value)}><option value="unlocked">Unlocked / IMEI clear</option><option value="carrier_locked">Carrier locked (-10%)</option><option value="activation_locked">Activation or iCloud locked</option></select></label>
              <fieldset className="calculator-accessories"><legend>Included accessories</legend><div>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={includedAccessories.includes(accessory)} onChange={(event) => setIncludedAccessories((current) => event.target.checked ? [...current, accessory] : current.filter((item) => item !== accessory))} />{accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</div><small>{result.accessoryDeduction > 0 ? `${pawnMoney(result.accessoryDeduction, valuationCurrency)} accessory deduction` : 'No accessory deduction'}</small></fieldset>
              <label><span>Estimated repair cost</span><div className="input-prefix"><span>{valuationCurrency}</span><MoneyInput currency={valuationCurrency} value={repairCost} onValueChange={(value) => setRepairCost(Number(value))} /></div></label>
            </div>
          </div>

          <div className="pawn-policy-control">
            <div><strong>3. Shop lending policy</strong><small>Keep enough resale value in reserve for price changes, storage time, and collection risk.</small></div>
            <label><div className="range-label"><div className="pawn-rate-value"><strong>{pawnRate}%</strong><span>Loan-to-value</span></div><small>Recommended: 40-50%</small></div><input className="range-input" type="range" min="40" max="50" value={pawnRate} onChange={(event) => setPawnRate(Number(event.target.value))} /></label>
          </div>
          <div className={`notice-box ${result.eligible ? '' : 'danger'}`}><AlertTriangle size={18} /><p><strong>{result.eligible ? 'Physical inspection is still required' : 'Do not accept this phone as collateral'}</strong><span>{result.eligible ? 'Confirm IMEI ownership, display, cameras, speakers, charging, Face ID or fingerprint, and repair estimate before approval.' : 'Activation-locked or iCloud-locked phones should have no pawn value until the owner removes the lock in front of staff.'}</span></p></div>
        </article>

        <div className="valuation-side">
          <article className={`surface-card valuation-result-card ${result.eligible ? '' : 'valuation-ineligible'}`}>
            <div className="valuation-result-heading"><span className="eyebrow">{autoCalculate ? 'Recommended offer' : 'Manual offer'}</span><span className={`valuation-status ${result.eligible ? 'eligible' : 'blocked'}`}>{result.eligible ? 'Eligible' : 'Blocked'}</span></div>
            <div className="valuation-hero">
              <small>{result.eligible ? autoCalculate ? 'Maximum pawn principal' : 'Manual maximum principal' : 'Offer unavailable'}</small>
              <strong>{result.eligible ? pawnMoney(result.maximumPawn, valuationCurrency) : pawnMoney(0, valuationCurrency)}</strong>
              <div className="khr-equivalent">
                {result.eligible ? exchangeRate ? pawnEquivalentText(result.maximumPawn, valuationCurrency, exchangeRate) : 'Loading exchange rate...' : 'Remove activation lock before valuation'}
              </div>
              <span>{result.eligible ? `${pawnRate}% of ${autoCalculate ? 'adjusted' : 'manually entered'} resale value` : 'Activation lock failed the eligibility check'}</span>
              {exchangeRate && (
                <span className="exchange-rate-source">
                  1 USD = {riel.format(exchangeRate.usdKhr)} KHR - {exchangeRate.source === 'ABA PayWay' ? `ABA PayWay ${exchangeRate.side || 'bank'} rate` : 'ABA configured fallback'}
                </span>
              )}
            </div>
            {autoCalculate && <div className="calculation-breakdown">
              <div><span>Resale value</span><strong>{pawnMoney(marketPrice, valuationCurrency)}</strong></div>
              <div><span>Age ({Math.round(result.ageRate * 100)}%)</span><strong>-{pawnMoney(result.ageDeduction, valuationCurrency)}</strong></div>
              <div><span>Condition ({Math.round(result.conditionRate * 100)}%)</span><strong>-{pawnMoney(result.conditionDeduction, valuationCurrency)}</strong></div>
              <div><span>Battery ({Math.round(result.batteryRate * 100)}%)</span><strong>-{pawnMoney(result.batteryDeduction, valuationCurrency)}</strong></div>
              <div><span>Lock and accessories</span><strong>-{pawnMoney(result.carrierLockDeduction + result.accessoryDeduction, valuationCurrency)}</strong></div>
              <div><span>Repair cost</span><strong>-{pawnMoney(Math.max(repairCost, 0), valuationCurrency)}</strong></div>
              <div className="estimated-row"><span>{autoCalculate ? 'Estimated resale value' : 'Resale value'}</span><strong>{pawnMoney(result.estimatedValue, valuationCurrency)}</strong></div>
              <div className="reserve-row"><span>Shop risk reserve after loan</span><strong>{pawnMoney(result.riskReserve, valuationCurrency)}</strong></div>
            </div>}
            <button className="primary-button full-width" onClick={useForPawn} disabled={!result.eligible || result.maximumPawn <= 0}><HandCoins size={17} /> Start pawn with this offer</button>
            <button className="ghost-button full-width" onClick={saveValuation}><FileText size={16} /> Save valuation only</button>
          </article>
          <section className="surface-card workflow-note valuation-checklist" aria-labelledby="valuation-checklist-title">
            <span className="workflow-note-icon"><ScanLine /></span>
            <div><span className="eyebrow">Before releasing money</span><h3 id="valuation-checklist-title">Complete the acceptance checklist</h3><p>The calculator recommends an amount; staff verification decides whether the phone can be accepted.</p></div>
            <div className="verification-chips"><span>IMEI clear</span><span>Ownership confirmed</span><span>ID optional</span><span>Activation lock off</span><span>Hardware tested</span></div>
          </section>
        </div>
      </section>
    </>
  )
}


