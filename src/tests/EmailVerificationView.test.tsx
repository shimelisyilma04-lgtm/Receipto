// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailVerificationView } from '../components/EmailVerificationView.js';
import { api, ApiError } from '../api.js';

describe('EmailVerificationView Component', () => {
  const mockUser = {
    id: 'user_12345',
    email: 'developer@example.com',
    name: 'Dev User',
    role: 'USER' as const,
    email_verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnVerified = vi.fn();
  const mockOnLogout = vi.fn();
  const mockOnShowToast = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockOnVerified.mockReset();
    mockOnLogout.mockReset();
    mockOnShowToast.mockReset();
  });

  it('renders initial view with masked email and 6 digit input boxes', () => {
    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    expect(screen.getByText('Verify your email')).toBeTruthy();
    expect(screen.getByText('de***r@example.com')).toBeTruthy();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBe(6);
    expect(screen.getByText('Verify & Continue')).toBeTruthy();
  });

  it('validates incomplete 6-digit code entry by keeping submit disabled', async () => {
    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const verifyBtn = screen.getByRole('button', { name: /Verify & Continue/i });
    expect((verifyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('executes successful verification when all 6 digits are entered', async () => {
    const verifiedUser = { ...mockUser, email_verified: true };
    const verifySpy = vi.spyOn(api, 'verifyEmail').mockResolvedValueOnce({
      user: verifiedUser,
      message: 'Verified',
    });

    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    // Fill in 6 digits: 123456
    const codeDigits = ['1', '2', '3', '4', '5', '6'];
    inputs.forEach((input, index) => {
      fireEvent.change(input, { target: { value: codeDigits[index] } });
    });

    // Auto-submits on 6th digit
    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith({
        code: '123456',
        email: 'developer@example.com',
        user_id: 'user_12345',
      });
      expect(mockOnVerified).toHaveBeenCalledWith(verifiedUser);
      expect(mockOnShowToast).toHaveBeenCalledWith(
        'Email verified successfully! Welcome to Receipto.',
        'success'
      );
    });
  });

  it('handles invalid verification code rejection from API', async () => {
    vi.spyOn(api, 'verifyEmail').mockRejectedValueOnce(
      new ApiError('Invalid verification code. Please check and try again.', 400)
    );

    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '9' } });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Invalid verification code. Please check and try again.')
      ).toBeTruthy();
    });
  });

  it('handles expired verification code (410 GONE)', async () => {
    vi.spyOn(api, 'verifyEmail').mockRejectedValueOnce(
      new ApiError('This verification code has expired.', 410)
    );

    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '0' } });
    });

    await waitFor(() => {
      expect(screen.getByText('This verification code has expired.')).toBeTruthy();
    });
  });

  it('allows user to open change email modal and cancel', () => {
    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const changeBtn = screen.getByText('Change email');
    fireEvent.click(changeBtn);

    expect(screen.getByText('Update registration email:')).toBeTruthy();
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Update registration email:')).toBeNull();
  });

  it('triggers onLogout callback when sign out button is clicked', () => {
    render(
      <EmailVerificationView
        user={mockUser}
        onVerified={mockOnVerified}
        onLogout={mockOnLogout}
        onShowToast={mockOnShowToast}
      />
    );

    const logOutBtn = screen.getByText('Sign out');
    fireEvent.click(logOutBtn);

    expect(mockOnLogout).toHaveBeenCalledOnce();
  });
});
