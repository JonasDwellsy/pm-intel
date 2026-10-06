import { createHmac } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { concessionsBridgeEnabled, CONCESSIONS_ACTIVATION_ORIGIN, CONCESSIONS_CONSENT_VERSION } from "@/lib/auth/concessions-activation";

export const runtime = "nodejs";
const headers = {"cache-control":"private, no-store","referrer-policy":"no-referrer"};
const inputSchema = z.object({token:z.string().regex(/^[a-f0-9]{64}$/),accepted:z.literal(true),consentVersion:z.literal(CONCESSIONS_CONSENT_VERSION)}).strict();
export async function POST(request:Request) {
  if (!concessionsBridgeEnabled()) return Response.json({error:"Activation unavailable."},{status:503,headers});
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({error:"Same-origin JSON required."},{status:403,headers});
  try {
    // This one endpoint admits authenticated pending sessions, only to complete
    // a product invitation. It never grants Operators/Markets access or removes
    // other Clerk tasks. User and session IDs never come from the request body.
    const {userId,sessionId} = await auth({treatPendingAsSignedOut:false});
    if (!userId || !sessionId) return Response.json({error:"Sign in first."},{status:401,headers});
    const reader=request.body?.getReader();
    if (!reader) return Response.json({error:"Invalid request."},{status:400,headers});
    let bytes=0;
    const chunks:Uint8Array[]=[];
    try { while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024){await reader.cancel();return Response.json({error:"Request too large."},{status:413,headers});}chunks.push(value);} }
    finally {reader.releaseLock();}
    const parsed=inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return Response.json({error:"Invalid invitation consent."},{status:400,headers});
    const input=parsed.data;
    const body=JSON.stringify({...input,userId,sessionId}), timestamp=String(Date.now());
    const signature=createHmac("sha256",process.env.CONCESSIONS_ACTIVATION_BRIDGE_SECRET!).update(`concessions-activation-v1\n${timestamp}\n${body}`).digest("hex");
    const result=await fetch(`${CONCESSIONS_ACTIVATION_ORIGIN}/api/invitations/activate`,{method:"POST",headers:{"content-type":"application/json","x-concessions-time":timestamp,"x-concessions-signature":signature},body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30_000)});
    if (!result.ok) return Response.json({error:"Concessions could not confirm this invitation."},{status:result.status>=500?503:403,headers});
    const data=await result.json();
    if (typeof data.organizationId!=="string" || !/^org_[a-zA-Z0-9]+$/.test(data.organizationId)) throw new Error("Invalid bridge response");
    return Response.json({organizationId:data.organizationId},{headers});
  } catch {return Response.json({error:"Activation could not be confirmed. Contact Dwellsy before retrying."},{status:503,headers});}
}
