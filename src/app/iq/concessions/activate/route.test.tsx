// @vitest-environment node
import {beforeEach,afterEach,test,expect,vi} from "vitest";
import {createHmac} from "node:crypto";
const auth=vi.hoisted(()=>vi.fn());
vi.mock("@clerk/nextjs/server",()=>({auth}));
import {POST} from "./route";
const token="a".repeat(64),secret="s".repeat(32),url="https://operators.iq.dwellsy.com/iq/concessions/activate";
const input={token,accepted:true,consentVersion:"concessions-invitation-v1"};
beforeEach(()=>{vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("CONCESSIONS_ACTIVATION_BRIDGE_ENABLED","1");vi.stubEnv("CONCESSIONS_ACTIVATION_BRIDGE_SECRET",secret);auth.mockResolvedValue({userId:"user_actual",sessionId:"sess_actual"});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
const request=(body:unknown=input,origin="https://operators.iq.dwellsy.com")=>new Request(url,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
test("server-derived identity is signed for the fixed destination, with no redirects or retries",async()=>{
  const fetcher=vi.fn(async()=>Response.json({organizationId:"org_expected"}));vi.stubGlobal("fetch",fetcher);
  const response=await POST(request());expect(response.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
  const [target,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(target).toBe("https://concessions.iq.dwellsy.com/api/invitations/activate");expect(options.redirect).toBe("error");
  const body=String(options.body),headers=options.headers as Record<string,string>;
  expect(JSON.parse(body).userId).toBe("user_actual");
  expect(headers["x-concessions-signature"]).toBe(createHmac("sha256",secret).update(`concessions-activation-v1\n${headers["x-concessions-time"]}\n${body}`).digest("hex"));
});
test("cross-origin, anonymous, forged identity and oversized requests never reach Concessions",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await POST(request(input,"https://evil.example"))).status).toBe(403);
  expect((await POST(request({...input,userId:"user_forged"}))).status).toBe(400);
  expect((await POST(request({...input,token:"x".repeat(2000)}))).status).toBe(413);
  auth.mockResolvedValue({userId:null,sessionId:null});expect((await POST(request())).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
