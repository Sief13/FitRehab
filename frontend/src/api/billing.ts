import type { Role, User } from "../auth/AuthContext";
import { request } from "./client";

export interface BillingStatus {
  role: Role;
  is_premium: boolean;
  premium_until: string | null;
  price_cents: number;
  currency: string;
  period_days: number;
}

export interface CheckoutInfo {
  checkout_id: string;
  description: string;
  amount_cents: number;
  currency: string;
  status: string; // "pending" | "paid"
}

export interface CardDetails {
  card_number: string; // digits only
  exp_month: number;
  exp_year: number; // two digits, e.g. 28
  cvc: string;
  cardholder: string;
}

export interface PayResult {
  user: User;
  premium_until: string;
}

export interface Payment {
  id: number;
  description: string;
  amount_cents: number;
  currency: string;
  status: string;
  card_last4: string | null;
  created_at: string;
  paid_at: string | null;
}

export const billingApi = {
  status: () => request<BillingStatus>("/api/billing/status"),
  payments: () => request<Payment[]>("/api/billing/payments"),
  createCheckout: () => request<{ checkout_id: string }>("/api/billing/checkout", { method: "POST" }),
  getCheckout: (checkoutId: string) => request<CheckoutInfo>(`/api/billing/checkout/${checkoutId}`),
  pay: (checkoutId: string, card: CardDetails) =>
    request<PayResult>(`/api/billing/checkout/${checkoutId}/pay`, {
      method: "POST",
      body: JSON.stringify(card),
    }),
};
