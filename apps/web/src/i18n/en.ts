/** Web wizard copy — English dictionary (Hindi locale can mirror this shape in `hi.ts`). */
export const en = {
  app: { name: 'Hospital OS' },
  wizard: {
    shellTitle: 'Setup wizard',
    back: 'Back',
    samplePrice: 'Sample price',
    steps: {
      signup: 'Sign up',
      facility: 'Facility',
      locations: 'Locations',
      plan: 'Plan',
      addons: 'Add-ons',
      checkout: 'Payment',
      invoice: 'Invoice',
      provisioning: 'Go live',
    },
  },
  signup: {
    title: 'Create your account',
    otpTitle: 'Verify mobile (mock OTP)',
  },
  facility: {
    title: 'Facility profile',
    description: 'Legal identity, GSTIN and bed capacity for your tier.',
    gstinHint: 'Optional — leave blank if not registered',
    saveContinue: 'Continue to locations',
    saved: 'Facility saved',
  },
  locations: {
    title: 'Locations',
    description: 'Add every branch that will share this subscription. State drives GST on invoices.',
    useDemo: 'Prefill Mumbai, Indore, Jaipur',
    saveContinue: 'Continue to plan',
    saved: 'Locations saved',
  },
  plan: {
    title: 'Choose plan',
    description: 'Live comparison from App Admin. Toggle monthly or annual billing.',
    saveContinue: 'Continue to add-ons',
    saved: 'Plan selected',
    samplePriceBadge: 'Sample price',
  },
  addons: {
    title: 'Add-on modules',
    description: 'Buy modules not in your tier. Prices are sample values per location.',
    empty: 'No purchasable add-ons for this plan.',
    add: 'Add to order',
    remove: 'Remove from order',
    pricePerLocation: '{price}/location/month · Sample price',
    saveContinue: 'Review and pay',
    saved: 'Add-ons saved',
  },
  checkout: {
    title: 'Review and pay',
    description: 'Mock Razorpay-style checkout with UPI, card, and net banking.',
    openModal: 'Open mock checkout',
    loadingQuote: 'Loading server quote…',
  },
  invoice: {
    title: 'GST tax invoice',
    description: 'Download PDF or print this HTML invoice. Supplier details use platform placeholders.',
    notReady: 'Complete payment first.',
    backCheckout: 'Back to checkout',
    continueProvisioning: 'Continue to provisioning',
    notReadyToast: 'Invoice not ready yet',
  },
  provisioning: {
    title: 'Setting up your hospital',
  },
} as const;

export type WebDictionary = typeof en;
export type WebMessageKey = {
  [K in keyof WebDictionary]: WebDictionary[K] extends string
    ? K
    : WebDictionary[K] extends object
      ? `${K & string}.${keyof WebDictionary[K] & string}`
      : never;
}[keyof WebDictionary];
