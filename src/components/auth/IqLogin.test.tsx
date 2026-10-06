import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), cookies: vi.fn(), redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("./ConcessionsActivation",()=>({ConcessionsActivation:()=> <output data-testid="activation"/>}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/image", () => ({ default: () => <span>Dwellsy IQ logo</span> }));
vi.mock("@clerk/nextjs", () => ({
  RedirectToTasks: () => <output data-testid="session-tasks" />,
  SignIn: (props: Record<string, string>) => <output data-testid="login">{JSON.stringify(props)}</output>,
  SignUp: (props: Record<string, string>) => <output data-testid="signup">{JSON.stringify(props)}</output>,
}));
import { IqLogin } from "./IqLogin";
const destination = "https://concessions.iq.dwellsy.com/app?__clerk_synced=false";
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});
test("only the enabled Concessions invitation handoff admits authenticated pending sessions",async()=>{
  vi.stubEnv("CONCESSIONS_ACTIVATION_BRIDGE_ENABLED","1");vi.stubEnv("CONCESSIONS_ACTIVATION_BRIDGE_SECRET","s".repeat(32));vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");
  mocks.auth.mockResolvedValue({userId:"user_pending"});
  render(await IqLogin({mode:"sign-in",query:{redirect_url:`https://concessions.iq.dwellsy.com/invitations/activate?token=${"a".repeat(64)}`}}));
  expect(screen.getByTestId("activation")).toBeDefined();
  expect(mocks.auth).toHaveBeenCalledWith({treatPendingAsSignedOut:false});
  expect(mocks.redirect).not.toHaveBeenCalled();
});
test("an existing IQ session returns to Concessions without another login or organization change", async () => {
  mocks.auth.mockResolvedValue({ userId: "shared-user", orgId: "operators-org" });
  await expect(IqLogin({ mode: "sign-in", query: { redirect_url: destination } })).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith(destination);
});
test.each(["sign-in", "sign-up"] as const)("%s carries the same destination through either authentication flow", async (mode) => {
  render(await IqLogin({ mode, query: { redirect_url: destination } }));
  const props = JSON.parse(screen.getByTestId(mode === "sign-in" ? "login" : "signup").textContent!);
  expect(props.forceRedirectUrl).toBe(destination);
  expect(props.path).toBe(`/iq/${mode}`);
  expect(props[mode === "sign-in" ? "signUpForceRedirectUrl" : "signInForceRedirectUrl"]).toBe(destination);
  expect(screen.getByTestId("session-tasks")).toBeDefined();
});
test("a task route recovers the validated product destination from the short-lived cookie", async () => {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: destination })) });
  render(await IqLogin({ mode: "sign-in", query: {} }));
  const props = JSON.parse(screen.getByTestId("login").textContent!);
  expect(props.forceRedirectUrl).toBe(destination);
  expect(screen.getByTestId("session-tasks")).toBeDefined();
});
test("untrusted returns never mount an auth form or redirect", async () => {
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: destination })) });
  render(await IqLogin({ mode: "sign-in", query: { redirect_url: "https://evil.example" } }));
  expect(screen.getByRole("heading").textContent).toBe("Open sign-in from your product");
  expect(screen.queryByTestId("login")).toBeNull();
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
