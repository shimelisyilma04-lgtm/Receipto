import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      },
  redact: {
    paths: [
      'password',
      'password_hash',
      'current_password',
      'new_password',
      'token',
      'sessionToken',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'stripe_secret_key',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SESSION_SECRET',
      'RESEND_API_KEY',
      'otp',
      'salt',
      'otp_hash',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
