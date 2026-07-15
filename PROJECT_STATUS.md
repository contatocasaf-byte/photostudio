# Suite Brasmam (Studio de Produtos + Gerador de Ofertas) — Status do Projeto

> Documento de retomada. Projeto ainda na **Fase 1 (esqueleto)**, em
> andamento — frontend e backend escaffoldados e validados localmente, mas
> **nenhum recurso de nuvem foi criado ainda** (Supabase, R2, Render,
> Vercel) e **nenhum repositório Git existe** para nenhum dos dois projetos.
> Se esta conversa for retomada mais tarde, comece lendo este arquivo e o
> plano completo em `C:\Users\RODRIGO\.claude\plans\sleepy-bubbling-horizon.md`.

## 1. O que é este projeto

Migração de dois apps desktop Python (Tkinter/CustomTkinter, uso local) para
uma única suite web multiusuário, acessível de qualquer dispositivo:

1. **Studio de Produtos** — remove fundo de fotos de produto (rembg), edita
   (mover/rotacionar/zoom/lápis/borracha/varinha mágica/crop), aplica marca
   d'água+logo, renomeia por código via OCR, compara pastas. Original:
   `C:\Users\RODRIGO\OneDrive\Documentos\. APP - REMOVEDOR DE FUNDOS\V7 -
   NOVO DESIGN\removedor_fundo.py` (~3070 linhas).
2. **Gerador de Ofertas** — pega as fotos processadas pelo Studio + planilha
   Excel (COD/REF/DESCRIÇÃO/PREÇO SP/PREÇO PA) + layout de fundo, gera peças
   prontas (Stories/Feed/WhatsApp) com preço, em lote. Original:
   `C:\Users\RODRIGO\OneDrive\Documentos\Gerador de Ofertas\
   GeradorOfertas_v11\` (`app.py`/`core.py`/etc.).

Os dois viram **um app só**, com biblioteca de fotos de produto
compartilhada (saída do Studio = entrada do Gerador de Ofertas), decisão
tomada porque é exatamente o fluxo real de trabalho hoje.

- **Plano de arquitetura completo:**
  `C:\Users\RODRIGO\.claude\plans\sleepy-bubbling-horizon.md` — decisões já
  tomadas (app separado do CRM, login multiusuário, backend Python mínimo
  só para rembg/OCR/geração de oferta, resto no navegador, hospedagem em
  tiers grátis pra validar antes de pagar) e detalhamento de que função de
  qual arquivo original vira o quê.
- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
  no frontend; FastAPI (Python) num microserviço separado só para as
  operações que precisam mesmo rodar em Python (rembg, OCR, geração de
  oferta); Supabase (Postgres + Auth) em projeto **próprio**, separado do
  CRM; Cloudflare R2 para armazenamento de imagens/fontes/layouts.
- **Localização local:**
  - Frontend: `C:\Users\RODRIGO\Projects\brasmam-studio`
  - Backend: `C:\Users\RODRIGO\Projects\brasmam-studio-api`
  - **Nenhum dos dois tem repositório Git ainda** — só existem no disco
    local. Nomes dos diretórios são provisórios (a suite ainda não tem
    nome/marca definidos).
- **Repositório GitHub / deploy:** não existem ainda (dependem dos passos
  da seção 3).
- **Projeto Supabase / bucket R2 / serviço Render:** não existem ainda.

## 2. Fases do plano (visão geral)

1. **Esqueleto** — repo Next.js + backend `/remove-background` + fluxo
   mínimo login → upload individual → remover fundo. **← estamos aqui**
2. Studio — lote (até 50) + editor completo (canvas) + aplicador de marca +
   renomeador (OCR) + comparador de pastas.
3. Gerador de Ofertas — modo individual (upload de layout/planilha, busca
   de produto, ajuste de foto, geração).
4. Gerador de Ofertas — editor de layout + biblioteca de fontes (upload) +
   modo em lote.

## 3. O que já foi construído (Fase 1, parcial)

### Frontend (`brasmam-studio`)
- Projeto Next.js criado (`create-next-app`, TypeScript + Tailwind + App
  Router + `src/`), **builda limpo** (`npm run build` sem erros).
- `src/lib/supabase/{client,server,middleware}.ts` — mesmo padrão do
  Cadência CRM (`@supabase/ssr`), adaptado: sem multi-tenant/role, só
  logado/não-logado. `proxy.ts` na raiz (Next.js 16 renomeou
  `middleware.ts` → `proxy.ts`, exporta `proxy()` em vez de `middleware()`).
- `src/lib/storage/r2.ts` — cliente R2 (`S3Client` da AWS SDK v3), cópia
  literal do padrão já validado em produção no CRM
  (`lib/storage/r2.ts` de lá). `src/lib/storage/public-url.ts` — helper
  separado (não `server-only`) pra montar URL pública de um objeto.
- `src/app/login/{page.tsx,actions.ts}` — login simples por e-mail/senha
  (sem cadastro público; contas são criadas manualmente no dashboard do
  Supabase, ver seção 5).
- `src/app/(app)/layout.tsx` — layout autenticado com navegação entre
  "Studio de Produtos" e "Gerador de Ofertas" + botão sair.
- `src/app/(app)/studio/page.tsx` + `actions.ts` — fluxo funcional de
  upload individual: pede URL presignada do R2 (`getUploadUrl`), sobe o
  arquivo direto pro R2 do navegador, chama `/api/remove-background`,
  mostra o resultado.
- `src/app/api/remove-background/route.ts` — rota proxy: valida sessão
  Supabase, repassa a chamada pro backend Python com um header
  `x-shared-secret` (evita expor o backend Python direto pro navegador ou
  pra internet sem controle).
- `src/app/(app)/ofertas/page.tsx` — placeholder ("chega na Fase 3").
- `.env.local.example` — todas as env vars que faltam preencher.
- Dependências já instaladas: `@supabase/supabase-js`, `@supabase/ssr`,
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `zustand`,
  `react-konva`+`konva` (editor de canvas, ainda não usado — entra na Fase
  2), `@dnd-kit/core`+`@dnd-kit/sortable` (drag-and-drop, ainda não usado).

### Backend (`brasmam-studio-api`)
- `rembg_logic.py` — port **literal** de `remove_internal_background` e
  `rembg_process` do script original (`removedor_fundo.py:177-339`), só
  adaptando `rembg_process` pra receber `bytes` em vez de path de arquivo
  (a imagem vem do R2, não do disco). *(Nota: `refine_with_second_pass` do
  original não foi portado — é código morto lá, nunca chamado em nenhum
  lugar do app original.)*
- `main.py` — FastAPI com `POST /remove-background` (baixa a imagem do R2
  pela key recebida, processa, sobe o resultado em `produtos/<uuid>.png`,
  devolve a key) e `GET /health`. Modelo `u2net` carregado uma vez só
  (lazy singleton, mesmo padrão do `_get_session` do app original).
- `Dockerfile` pronto pra deploy no Render (usa `$PORT` injetado em
  runtime).
- **Testado localmente e validado:** venv criado, dependências instaladas
  (ajuste feito: `rembg==2.0.61` do pin original não suporta Python 3.13,
  que é o que está instalado nesta máquina — trocado pra `2.0.67`), rodado
  contra uma foto real do lote de produtos Brasmam
  (`75401_1.png`, da pasta ". 2 Fotos PENDENTES DE PROCESSAMENTO") via
  `test_local.py` (bypassa R2, chama a lógica direto). Resultado
  conferido: PNG de saída tem transparência real no canal alfa (não só
  visual), objeto recortado corretamente. Arquivo de teste já foi apagado
  da pasta de fotos depois da validação.

## 4. O que falta para fechar a Fase 1

Bloqueado em recursos externos que só o usuário pode criar (contas/
billing) — checklist detalhado com o passo a passo exato em
`brasmam-studio/SETUP.md`:

1. Criar projeto Supabase novo (auth) e copiar URL/chave.
2. Criar bucket R2 novo + **configurar CORS manualmente** (armadilha já
   sofrida no bucket do CRM — sem isso o upload do navegador falha
   silenciosamente com "Failed to fetch") + token de API + habilitar
   domínio público.
3. Só depois disso dá pra testar o fluxo ponta a ponta local (`npm run
   dev` + backend local) — login → upload → remover fundo.
4. Deploy: subir os dois projetos pro GitHub (nenhum repo existe ainda),
   Render (backend) e Vercel (frontend).

Task pendente no tracker desta sessão: *"Fluxo mínimo Fase 1: login →
upload → remover fundo"* — bloqueada até os itens 1–2 acima existirem.

## 5. Contas de acesso

Nenhuma conta criada ainda (nem Supabase, nem usuários da equipe). Modelo
decidido: multiusuário, mas **sem cadastro público** — administrador cria
cada conta manualmente no dashboard do Supabase (Authentication → Users).

## 6. Decisões já tomadas (não reabrir sem motivo novo)

- App **separado** do Cadência CRM (repositório, deploy, projeto Supabase e
  bucket R2 todos independentes) — decisão explícita do usuário.
- Login **multiusuário** (Rodrigo + equipe), não single-user.
- Processamento pesado (rembg, OCR) roda **no navegador direto? Não** — via
  upload pra R2 + backend Python, porque o objetivo é acessar de qualquer
  lugar/dispositivo (decisão explícita, descartando a alternativa
  "tudo local, sem upload").
- Biblioteca de fontes do Gerador de Ofertas será **gerenciável via
  upload** (.ttf/.otf pro R2), não uma lista fixa embutida — porque
  `C:\Windows\Fonts` (usado hoje) não existe num servidor.
- Hospedagem do backend Python começa no **tier grátis do Render** (aceita
  cold start ocasional) em vez de Railway pago — só migra pra pago se o
  cold start incomodar de fato no uso real.
- Nome/marca da suite combinada: **ainda não definido**, decisão adiada
  pra quando os nomes dos diretórios/repositório forem fixados.
