import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string({ message: 'Full name is required.' }).trim().min(1, 'Full name is required.'),
  email: z.string({ message: 'A valid email address is required.' }).trim().email('A valid email address is required.').toLowerCase(),
  password: z.string({ message: 'Password must be at least 8 characters long.' }).min(8, 'Password must be at least 8 characters long.'),
  confirm_password: z.string().optional(),
  business_name: z.string().trim().optional(),
  terms_accepted: z.union([z.boolean(), z.literal('true'), z.literal('1'), z.string()]).transform((val) => val === true || val === 'true' || val === '1').refine((val) => val === true, {
    message: 'You must agree to the Terms and Conditions and Privacy Policy to create an account.',
  }),
}).refine((data) => data.confirm_password === undefined || data.password === data.confirm_password, {
  message: 'Passwords do not match.',
  path: ['confirm_password'],
});

export const loginSchema = z.object({
  email: z.string({ message: 'Email and password are required.' }).trim().min(1, 'Email and password are required.').email('Invalid email address.').toLowerCase(),
  password: z.string({ message: 'Email and password are required.' }).min(1, 'Email and password are required.'),
});

export const requestPasswordResetSchema = z.object({
  email: z.string({ message: 'Email is required.' }).trim().email('A valid email address is required.').toLowerCase(),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().email().toLowerCase().optional(),
  code: z.string({ message: 'Verification code is required.' }).trim().min(1, 'Verification code is required.'),
});

export const resetPasswordSchema = z.object({
  token: z.string({ message: 'Reset token is required.' }).min(1, 'Reset token is required.'),
  new_password: z.string({ message: 'Password must be at least 8 characters long.' }).min(8, 'Password must be at least 8 characters long.'),
  confirm_new_password: z.string().optional(),
});

export const changePasswordSchema = z.object({
  current_password: z.string({ message: 'Current password is required.' }).min(1, 'Current password is required.'),
  new_password: z.string({ message: 'New password must be at least 8 characters long.' }).min(8, 'New password must be at least 8 characters long.'),
});
