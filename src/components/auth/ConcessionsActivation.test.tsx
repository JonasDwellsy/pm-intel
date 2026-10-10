import React from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import {beforeEach,test,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({clerk:{loaded:true,session:{currentTask:{key:"choose-organization"}},setActive:vi.fn(),signOut:vi.fn()}}));
vi.mock("@clerk/nextjs",()=>({useClerk:()=>mocks.clerk,SignIn:()=> <output data-testid="other-task"/>,SignUp:()=> <output data-testid="other-task"/>}));
import {ConcessionsActivation} from "./ConcessionsActivation";
beforeEach(()=>{mocks.clerk.session.currentTask.key="choose-organization";vi.restoreAllMocks();});
const props={token:"a".repeat(64),mode:"sign-in" as const,destination:"https://concessions.iq.dwellsy.com/invitations/activate"};
test("Terms starts unchecked and activation requires affirmative choice",()=>{
  render(<ConcessionsActivation {...props}/>);
  expect(screen.getByRole("heading",{name:"Welcome to Concessions."})).toBeDefined();
  expect(screen.getByText("Your listing-partner benefit",{selector:"span"})).toBeDefined();
  expect(screen.getByText("Your company is already approved.",{selector:"p"})).toBeDefined();
  expect(screen.queryByText(/Keep listing with Dwellsy/)).toBeNull();
  const checkbox=screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  expect((screen.getByRole("button",{name:"Open Concessions"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  expect((screen.getByRole("button",{name:"Open Concessions"}) as HTMLButtonElement).disabled).toBe(false);
});
test.each(["reset-password","setup-mfa"])("%s stays in Clerk rather than activating a workspace",task=>{
  mocks.clerk.session.currentTask.key=task;render(<ConcessionsActivation {...props}/>);
  expect(screen.getByTestId("other-task")).toBeDefined();expect(screen.queryByRole("checkbox")).toBeNull();
});
