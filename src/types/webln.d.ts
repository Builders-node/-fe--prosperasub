interface WebLNProvider {
  enable(): Promise<void>;
  sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
  makeInvoice(args: { amount: number; defaultMemo?: string }): Promise<{ paymentRequest: string }>;
  signMessage(message: string): Promise<{ signature: string }>;
  verifyMessage(signature: string, message: string): Promise<void>;
}

interface Window {
  webln?: WebLNProvider;
}
