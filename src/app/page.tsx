import { redirect } from "next/navigation";
import { getCurrentAccess, primeiraRotaAcessivel } from "@/lib/auth/access";

export default async function Home() {
  const access = await getCurrentAccess();
  redirect(primeiraRotaAcessivel(access) ?? "/sem-acesso");
}
