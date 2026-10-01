import { IqLogin } from "@/components/auth/IqLogin";
import type { LoginQuery } from "@/lib/auth/iq-login-return";

export const metadata = { title: { absolute: "Create your Dwellsy IQ account" }, robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  return <IqLogin mode="sign-up" query={await searchParams} />;
}
