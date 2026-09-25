/** Versioned confirmation plus print-file bundles. */

export interface ConfirmationBundle {
  id: string;
  requestId: string;
  version: number;
  confirmationKey: string;
  printFileKeys: string[];
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Shipment {
  id: string;
  requestId: string;
  invoiceKey: string;
  trackingNumber: string | null;
  specialDeliveryDate: string | null;
  createdBy: string;
  createdAt: string;
}
