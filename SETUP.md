# Checklist de recursos externos — Fase 1

Estes passos exigem conta/login em cada serviço, então precisam ser feitos
por você. Depois de cada um, me passe as credenciais geradas (ou cole
direto no `.env.local` / `.env`) que eu sigo com a integração.

## 1. Supabase (auth + banco, projeto novo)

1. Acesse [supabase.com](https://supabase.com) → **New project** (organização
   pode ser a mesma do CRM, mas o **projeto** tem que ser novo e separado).
2. Nome sugerido: `brasmam-studio` (ou o que preferir).
3. Depois de criado, vá em **Project Settings → API** e copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / `publishable` key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Como não há tela de cadastro público, crie as contas da equipe manualmente
   em **Authentication → Users → Add user** (defina e-mail + senha, ou envie
   convite por e-mail).
5. **Atenção:** projeto grátis do Supabase pausa após ~1 semana sem uso —
   se isso acontecer, um clique em "Restore" no dashboard reativa.

## 2. Cloudflare R2 (armazenamento de imagens, bucket novo)

Pode ser a **mesma conta Cloudflare** já usada para o bucket do CRM — só
precisa de um bucket novo, dedicado a este app.

1. No painel Cloudflare → **R2** → **Create bucket**. Nome sugerido:
   `brasmam-studio-files`.
2. **Settings → CORS Policy** do bucket novo → adicionar uma regra
   permitindo `PUT`/`GET`/`HEAD` a partir do domínio onde o app vai rodar
   (`http://localhost:3000` pra testar local, depois o domínio da Vercel).
   **Isso é manual e fácil de esquecer** — sem isso o upload direto do
   navegador falha com "Failed to fetch" (já vivemos isso no bucket do CRM).
3. Em **Manage R2 API Tokens**, crie um token com permissão de
   leitura/escrita **só nesse bucket novo** (não reaproveitar o token do
   CRM, para manter os dois isolados). Anote:
   - Endpoint (algo como `https://<account_id>.r2.cloudflarestorage.com`) →
     `R2_ENDPOINT`
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Nome do bucket → `R2_BUCKET_NAME`
4. Pra servir as imagens processadas publicamente (preview no navegador),
   habilite o **domínio público** do bucket (`R2.dev` por enquanto, tier
   grátis) em **Settings → Public Access** → copie a URL →
   `NEXT_PUBLIC_R2_PUBLIC_URL`.

## 3. Backend Python (Render, tier grátis)

1. Suba a pasta `brasmam-studio-api` (que já criei) pra um repositório
   Git novo (posso fazer isso junto com você quando estiver pronto).
2. No [render.com](https://render.com) → **New → Web Service** → conectar
   o repositório → Render detecta o `Dockerfile` automaticamente.
3. Plano: **Free**.
4. Em **Environment**, adicionar as mesmas `R2_*` do passo 2, mais um
   `BACKEND_SHARED_SECRET` (qualquer string aleatória longa, só pra travar
   o acesso — só o Next.js deve chamar esse backend).
5. Depois do deploy, copiar a URL pública do serviço (tipo
   `https://brasmam-studio-api.onrender.com`) → `BACKEND_URL` no Next.js,
   e o mesmo `BACKEND_SHARED_SECRET` nos dois lados.

## 4. Vercel (frontend)

1. [vercel.com](https://vercel.com) → **Add New → Project** → importar o
   repositório do `brasmam-studio` (crio o repo Git quando você confirmar).
2. Adicionar todas as env vars acima (as do `.env.local.example`) em
   **Settings → Environment Variables**.
3. Deploy automático a cada push, igual ao CRM.

---

## O que eu já fiz (sem depender de conta nenhuma)

- Projeto Next.js criado em `C:\Users\RODRIGO\Projects\brasmam-studio`
  (login, layout, upload individual, chamada ao backend) — builda limpo.
- Backend FastAPI criado em `C:\Users\RODRIGO\Projects\brasmam-studio-api`
  com `/remove-background`, testado localmente contra uma foto real do
  lote de produtos (fundo removido corretamente, transparência real
  confirmada no canal alfa).

Assim que você tiver os itens 1 e 2 (Supabase + R2) prontos, já dá pra
testar o fluxo completo local (`npm run dev` + backend local) antes de
mexer em Render/Vercel.
