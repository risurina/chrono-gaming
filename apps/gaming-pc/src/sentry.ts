import * as Sentry from "@sentry/react";
import { redactForTelemetry } from "./shared/logger-factory";

const CLIENT_VERSION = "0.1.0";

/**
 * Webview Sentry init using `@sentry/react`.
 * Gated on VITE_SENTRY_DSN; scrubs PII/secrets before sending, mirroring the
 * original `beforeSend` redaction.
 */
export const initSentry = (): void => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    release: `pc-client@${CLIENT_VERSION}`,
    environment: import.meta.env.MODE || "production",
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        event.user = { id: event.user.id };
      }
      event.extra = redactForTelemetry(event.extra);
      event.contexts = redactForTelemetry(event.contexts);
      event.request = redactForTelemetry(event.request);
      event.breadcrumbs?.forEach((breadcrumb) => {
        if (breadcrumb.data) {
          breadcrumb.data = redactForTelemetry(breadcrumb.data);
        }
      });
      return event;
    },
  });
};
