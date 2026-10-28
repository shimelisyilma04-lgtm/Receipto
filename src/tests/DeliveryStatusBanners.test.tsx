// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeliveryStatusBanners } from '../components/verification/DeliveryStatusBanners.js';

describe('DeliveryStatusBanners Component', () => {
  it('renders sent status banner when verification email is delivered', () => {
    render(
      <DeliveryStatusBanners
        deliveryStatus="sent"
        resendCooldown={60}
        resending={false}
        onResendCode={vi.fn()}
        onAutoFillDevOtp={vi.fn()}
      />
    );

    expect(screen.getByText('Verification email sent')).toBeTruthy();
    expect(screen.getByText('Check your inbox for your 6-digit code.')).toBeTruthy();
  });

  it('renders not_configured banner when Resend key is missing', () => {
    render(
      <DeliveryStatusBanners
        deliveryStatus="not_configured"
        resendCooldown={60}
        resending={false}
        onResendCode={vi.fn()}
        onAutoFillDevOtp={vi.fn()}
      />
    );

    expect(screen.getByText("Email verification isn't configured yet.")).toBeTruthy();
  });

  it('renders error banner with try again action', () => {
    const handleResend = vi.fn();
    render(
      <DeliveryStatusBanners
        deliveryStatus="error"
        resendCooldown={0}
        resending={false}
        onResendCode={handleResend}
        onAutoFillDevOtp={vi.fn()}
      />
    );

    expect(screen.getByText('Unable to send verification email. Please try again.')).toBeTruthy();
    const tryAgainBtn = screen.getByText('Try again');
    fireEvent.click(tryAgainBtn);
    expect(handleResend).toHaveBeenCalledOnce();
  });

  it('renders development OTP banner and triggers autofill on click', () => {
    const handleAutoFill = vi.fn();
    render(
      <DeliveryStatusBanners
        deliveryStatus="not_configured"
        devOtp="842190"
        resendCooldown={0}
        resending={false}
        onResendCode={vi.fn()}
        onAutoFillDevOtp={handleAutoFill}
      />
    );

    expect(screen.getByText('DEVELOPMENT ONLY')).toBeTruthy();
    expect(screen.getByText('842190')).toBeTruthy();

    const autoFillBtn = screen.getByText('Auto-fill & Verify');
    fireEvent.click(autoFillBtn);
    expect(handleAutoFill).toHaveBeenCalledWith('842190');
  });
});
