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

## 3. GitHub (dois repositórios novos, vazios)

Os dois projetos já têm commit local pronto — só falta um repositório
vazio no GitHub pra cada um, pra eu poder subir (`git push`). Não tenho
`gh` CLI nem suas credenciais, então esse passo é manual:

1. [github.com/new](https://github.com/new) → criar **`brasmam-studio`**
   (frontend) — deixe **vazio**, sem README/gitignore/license (já temos
   tudo local, marcar qualquer uma dessas opções cria conflito no push).
2. Repetir pra **`brasmam-studio-api`** (backend).
3. Me passa as duas URLs (algo como
   `https://github.com/<seu-usuário>/brasmam-studio.git`) que eu configuro
   o remote e faço o push dos dois.

## 4. Backend Python (Render, tier grátis)

1. No [render.com](https://render.com) → **New → Web Service** → conectar
   o repositório `brasmam-studio-api` do GitHub (passo 3) → Render detecta
   o `Dockerfile` automaticamente.
2. Plano: **Free**.
3. Em **Environment**, adicionar as mesmas `R2_*` do passo 2, mais um
   `BACKEND_SHARED_SECRET` (qualquer string aleatória longa — já gerei uma
   pro `.env` local, pode reaproveitar o mesmo valor: veja
   `brasmam-studio-api\.env`).
4. Depois do deploy, copiar a URL pública do serviço (tipo
   `https://brasmam-studio-api.onrender.com`) → `BACKEND_URL` no Next.js,
   e o mesmo `BACKEND_SHARED_SECRET` nos dois lados.

## 5. Vercel (frontend)

1. [vercel.com](https://vercel.com) → **Add New → Project** → importar o
   repositório `brasmam-studio` do GitHub (passo 3).
2. Adicionar todas as env vars do `.env.local` (veja
   `brasmam-studio\.env.local`) em **Settings → Environment Variables**.
3. Deploy automático a cada push, igual ao CRM.

---

## O que eu já fiz (sem depender de conta nenhuma)

- Projeto Next.js criado em `C:\Users\RODRIGO\Projects\brasmam-studio`
  (login, layout, upload individual e em lote, chamada ao backend) —
  builda limpo, já testado por você de ponta a ponta local.
- Backend FastAPI criado em `C:\Users\RODRIGO\Projects\brasmam-studio-api`
  com `/remove-background`, incluindo pós-processamento vetorizado
  (numpy/scipy) pra remover ilhas internas de fundo — ~20x mais rápido
  que a primeira versão (Python puro), importante porque hoje o backend
  roda no seu computador durante os testes locais.
- Ambos os projetos já têm **commit local** (`git init` + primeiro
  commit) — só falta o repositório vazio no GitHub (passo 3 acima) pra eu
  poder subir.

Falta só o GitHub (passo 3) pra eu conseguir avançar com Render/Vercel.
