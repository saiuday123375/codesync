const Sentry = require('@sentry/node');
const logger = require('./logger');

const initSentry = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
    });
    logger.info('Sentry Node SDK initialized successfully.');
  }
};

const captureError = (error, metadata = {}) => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (metadata.roomId) scope.setTag('roomId', metadata.roomId);
    if (metadata.eventType) scope.setTag('eventType', metadata.eventType);
    if (metadata.userId) scope.setTag('userId', metadata.userId);
    
    // Sentry automatically logs the error name, message, and stack trace securely
    Sentry.captureException(error);
  });
};

module.exports = { initSentry, captureError };
