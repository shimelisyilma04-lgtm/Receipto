export interface SendReminderOptions {
  to: string;
  clientName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  businessName?: string;
  tone?: 'friendly' | 'standard' | 'urgent';
  customMessage?: string;
}

export interface EmailResult {
  success: boolean;
  configured: boolean;
  messageId?: string;
  statusText: string;
  error?: string;
}

export interface SendVerificationEmailOptions {
  to: string;
  name: string;
  otp: string;
}

export type VerificationEmailDeliveryResult = {
  success: boolean;
  messageId?: string;
  statusText: string;
  reason?: 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_PROVIDER_ERROR' | string;
  error?: string;
};

export interface SubscriptionEmailOptions {
  to: string;
  name: string;
  planName: string;
  billingInterval: string;
  amountFormatted: string;
}

export interface WelcomeEmailOptions {
  to: string;
  name: string;
  businessName?: string;
}

export interface PasswordResetEmailOptions {
  to: string;
  name: string;
  otp: string;
}
