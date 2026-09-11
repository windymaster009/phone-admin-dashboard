import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DetailModalShell from './DetailModalShell'
import DetailModalHeader from './DetailModalHeader'
import DetailModalBody from './DetailModalBody'
import DetailModalFooter from './DetailModalFooter'

describe('DetailModal reusable component suite', () => {
  describe('DetailModalShell', () => {
    it('renders with accessible dialog attributes and locks body scrolling', () => {
      const handleClose = vi.fn()
      const { unmount } = render(
        <DetailModalShell
          onClose={handleClose}
          titleId="test-modal-title"
          descriptionId="test-modal-desc"
          ariaLabel="Test modal dialog"
        >
          <p id="test-modal-title">Title</p>
          <p id="test-modal-desc">Description</p>
          <button type="button">Focusable</button>
        </DetailModalShell>,
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'test-modal-title')
      expect(dialog).toHaveAttribute('aria-describedby', 'test-modal-desc')
      expect(document.body.classList.contains('detail-modal-open')).toBe(true)

      unmount()
      expect(document.body.classList.contains('detail-modal-open')).toBe(false)
    })

    it('triggers onClose when backdrop is clicked, but not when modal content is clicked', async () => {
      const handleClose = vi.fn()
      const user = userEvent.setup()

      render(
        <DetailModalShell onClose={handleClose}>
          <div data-testid="inside-content">Content</div>
        </DetailModalShell>,
      )

      // Click inside content: should not trigger onClose
      await user.click(screen.getByTestId('inside-content'))
      expect(handleClose).not.toHaveBeenCalled()

      // Click backdrop: should trigger onClose
      const backdrop = document.querySelector('.detail-modal-backdrop') as HTMLElement
      expect(backdrop).toBeInTheDocument()
      fireEvent.click(backdrop)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('closes when Escape key is pressed', () => {
      const handleClose = vi.fn()

      render(
        <DetailModalShell onClose={handleClose}>
          <button type="button">Inside Button</button>
        </DetailModalShell>,
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('sets visual viewport CSS variables on mount', () => {
      render(
        <DetailModalShell onClose={vi.fn()}>
          <div>Test</div>
        </DetailModalShell>,
      )

      const backdrop = document.querySelector('.detail-modal-backdrop') as HTMLElement
      expect(backdrop.style.getPropertyValue('--modal-viewport-height')).toBeTruthy()
      expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBeTruthy()
    })
  })

  describe('DetailModalHeader', () => {
    it('renders eyebrow, title, description, badge, leading media, and close button', async () => {
      const handleClose = vi.fn()
      const user = userEvent.setup()

      render(
        <DetailModalHeader
          eyebrow="Contract Category"
          title="Contract #1001"
          titleId="header-title-id"
          description="Detailed contract subtitle"
          descriptionId="header-desc-id"
          leadingMedia={<span data-testid="test-media">Media</span>}
          badge={<span data-testid="test-badge">Active</span>}
          onClose={handleClose}
          closeLabel="Dismiss details"
        />,
      )

      expect(screen.getByText('Contract Category')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Contract #1001' })).toBeInTheDocument()
      expect(screen.getByText('Detailed contract subtitle')).toBeInTheDocument()
      expect(screen.getByTestId('test-media')).toBeInTheDocument()
      expect(screen.getByTestId('test-badge')).toBeInTheDocument()

      const closeButton = screen.getByRole('button', { name: 'Dismiss details' })
      expect(closeButton).toBeInTheDocument()

      await user.click(closeButton)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('DetailModalBody', () => {
    it('renders scrollable children container', () => {
      render(
        <DetailModalBody className="custom-body-class">
          <p>Body Content</p>
        </DetailModalBody>,
      )

      const body = screen.getByText('Body Content').closest('.detail-modal-body')
      expect(body).toBeInTheDocument()
      expect(body).toHaveClass('custom-body-class')
    })
  })

  describe('DetailModalFooter', () => {
    it('renders utility, transaction, destructive, and dismiss actions in separate structural regions', () => {
      render(
        <DetailModalFooter
          banner={<div data-testid="footer-banner">Warning: Overdue</div>}
          utilityActions={<button type="button">Documents</button>}
          transactionActions={<button type="button">Pay</button>}
          secondaryActions={<button type="button">View All</button>}
          destructiveAction={<button type="button">Delete</button>}
          dismissAction={<button type="button">Close</button>}
        />,
      )

      expect(screen.getByTestId('footer-banner')).toBeInTheDocument()

      const utilityBtn = screen.getByRole('button', { name: 'Documents' })
      expect(utilityBtn.closest('.detail-modal-utility-group')).toBeInTheDocument()
      expect(utilityBtn.closest('.detail-modal-footer-main')).toBeInTheDocument()

      const payBtn = screen.getByRole('button', { name: 'Pay' })
      const viewAllBtn = screen.getByRole('button', { name: 'View All' })
      expect(payBtn.closest('.detail-modal-transaction-group')).toBeInTheDocument()
      expect(viewAllBtn.closest('.detail-modal-transaction-group')).toBeInTheDocument()
      expect(payBtn.closest('.detail-modal-footer-main')).toBeInTheDocument()

      const deleteBtn = screen.getByRole('button', { name: 'Delete' })
      expect(deleteBtn.closest('.detail-modal-danger-group')).toBeInTheDocument()
      expect(deleteBtn.closest('.detail-modal-footer-secondary')).toBeInTheDocument()
      expect(deleteBtn.closest('.detail-modal-utility-group')).toBeNull()

      const closeBtn = screen.getByRole('button', { name: 'Close' })
      expect(closeBtn.closest('.detail-modal-dismiss-group')).toBeInTheDocument()
      expect(closeBtn.closest('.detail-modal-footer-secondary')).toBeInTheDocument()
      expect(closeBtn.closest('.detail-modal-transaction-group')).toBeNull()
    })

    it('renders direct children for custom consumers like Inventory and Trade', () => {
      render(
        <DetailModalFooter>
          <button type="button">Custom Direct Action</button>
        </DetailModalFooter>,
      )

      const customBtn = screen.getByRole('button', { name: 'Custom Direct Action' })
      expect(customBtn).toBeInTheDocument()
      expect(customBtn.closest('.detail-modal-footer')).toBeInTheDocument()
      expect(document.querySelector('.detail-modal-footer-main')).toBeNull()
    })
  })
})
