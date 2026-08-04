import { useEffect, useRef } from 'react'

export default function LoanRouteCompatibility() {
  const openedOnLoans = useRef(window.location.pathname === '/loans')

  useEffect(() => {
    if (!openedOnLoans.current) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const loanWorkspaceActive = document.querySelector('.main-content.loan-route-active')
      if (loanWorkspaceActive) {
        if (window.location.pathname !== '/loans') {
          window.history.replaceState({ view: 'loans' }, '', '/loans')
        }
        document.title = 'Loans · PhoneFlow'
        window.clearInterval(timer)
      } else if (attempts >= 50) {
        window.clearInterval(timer)
      }
    }, 100)

    return () => window.clearInterval(timer)
  }, [])

  return null
}
