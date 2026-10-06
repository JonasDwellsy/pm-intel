import assert from "node:assert/strict";
import test from "node:test";
import {concessionsActivationToken,concessionsBridgeEnabled} from "./concessions-activation";
const token="a".repeat(64),url=`https://concessions.iq.dwellsy.com/invitations/activate?token=${token}`;
test("activation accepts only exact Concessions production path and one opaque token",()=>{
  assert.equal(concessionsActivationToken(url),token);
  assert.equal(concessionsActivationToken(`${url}&__clerk_synced=false`),token);
  for(const value of [null,url.replace("concessions.iq.dwellsy.com","evil.com"),url.replace("https:","http:"),url.replace("/activate?","/accept?"),`${url}&token=${token}`,`${url}&redirect=https://evil.com`,`${url}#fragment`,url.replace(token,"bad")])assert.equal(concessionsActivationToken(value),null);
});
test("activation bridge is off without explicit production settings",()=>{
  const env={CONCESSIONS_ACTIVATION_BRIDGE_ENABLED:"1",CONCESSIONS_ACTIVATION_BRIDGE_SECRET:"s".repeat(32),NODE_ENV:"production",VERCEL_ENV:"production"};
  assert.equal(concessionsBridgeEnabled(env),true);
  for(const change of [{VERCEL_ENV:"preview"},{CONCESSIONS_ACTIVATION_BRIDGE_ENABLED:"0"},{CONCESSIONS_ACTIVATION_BRIDGE_SECRET:"short"}])assert.equal(concessionsBridgeEnabled({...env,...change}),false);
});
