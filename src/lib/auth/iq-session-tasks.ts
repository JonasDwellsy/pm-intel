import { iqLoginReturn } from "./iq-login-return";

export const IQ_LOGIN_RETURN_COOKIE = "dwellsy_iq_login_return";
export const IQ_LOGIN_RETURN_MAX_AGE_SECONDS = 20 * 60;

export const IQ_SESSION_TASK_URLS = {
  "choose-organization": "/iq/sign-in/tasks/choose-organization",
  "reset-password": "/iq/sign-in/tasks/reset-password",
  "setup-mfa": "/iq/sign-in/tasks/setup-mfa",
} as const;

export function recoverIqLoginReturn(value: string | null | undefined) {
  return iqLoginReturn({ redirect_url: value ?? undefined });
}
