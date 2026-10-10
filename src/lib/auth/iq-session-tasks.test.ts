import assert from "node:assert/strict";
import test from "node:test";
import { IQ_LOGIN_RETURN_MAX_AGE_SECONDS, IQ_SESSION_TASK_URLS, recoverIqLoginReturn } from "./iq-session-tasks";

test("routes every Clerk session task through the shared IQ sign-in component", () => {
  assert.deepEqual(IQ_SESSION_TASK_URLS, {
    "choose-organization": "/iq/sign-in/tasks/choose-organization",
    "reset-password": "/iq/sign-in/tasks/reset-password",
    "setup-mfa": "/iq/sign-in/tasks/setup-mfa",
  });
});

test("recovers a validated product return from the short-lived auth cookie", () => {
  const destination = "https://concessions.iq.dwellsy.com/app?market=cbsa-41860&__clerk_synced=false";
  assert.equal(recoverIqLoginReturn(destination), destination);
  assert.equal(IQ_LOGIN_RETURN_MAX_AGE_SECONDS, 20 * 60);
});

test("rejects missing and untrusted auth-cookie returns", () => {
  for (const value of [
    "https://evil.example/app",
    "https://concessions.iq.dwellsy.com.evil.example/app",
    "not-a-url",
    null,
    undefined,
  ]) assert.equal(recoverIqLoginReturn(value), null);
});
