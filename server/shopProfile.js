function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function shopProfile() {
  return {
    name: clean(process.env.SHOP_NAME) || 'PhoneFlow',
    subtitle: clean(process.env.SHOP_SUBTITLE) || 'Phone Shop Management',
    phone: clean(process.env.SHOP_PHONE),
    email: clean(process.env.SHOP_EMAIL),
    address: clean(process.env.SHOP_ADDRESS),
    taxId: clean(process.env.SHOP_TAX_ID),
    logoUrl: clean(process.env.SHOP_LOGO_URL),
    receiptFooter: clean(process.env.SHOP_RECEIPT_FOOTER) || 'Thank you for your business.',
  }
}
