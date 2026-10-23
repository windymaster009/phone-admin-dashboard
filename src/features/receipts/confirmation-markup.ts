export function escapeConfirmationHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

export function confirmationRow(label: string, value: string | number): string {
  return `<div class="receipt-row"><span>${escapeConfirmationHtml(label)}</span><strong>${escapeConfirmationHtml(value)}</strong></div>`
}
