# Criador de Catálogos — Especificação Técnica

> Módulo 3 da Suite Brasmam (junto com Studio de Produtos e Gerador de
> Ofertas). Documento de retomada, no mesmo padrão dos demais documentos de
> especificação do ecossistema Brasmam/Cadência.

## 1. O que é este módulo

Editor online para criação de catálogos de produtos em formato paginado
(PDF final), que resolve o problema central de qualquer catálogo
comercial: **inserir, remover ou reordenar um produto no meio da lista sem
precisar realinhar manualmente tudo que vem depois.**

Diferente de uma ferramenta de design genérica (Canva, InDesign), aqui o
usuário desenha **um card de produto por seção/categoria do catálogo** —
livremente, com a cara que quiser — e o sistema usa esse card como molde
repetível numa grade inferida automaticamente para os produtos daquela
seção. O resultado tem "cara de feito à mão", mas reflow (realinhamento
automático dos produtos seguintes) é garantido pela própria estrutura de
dados, não por ajuste manual.

Este módulo é **parte da Suite Brasmam**, não do Cadência CRM. Consome a
biblioteca de fotos processadas pelo Studio de Produtos (mesma relação já
estabelecida entre Studio → Gerador de Ofertas: saída de um módulo é
entrada do outro).

### 1.1 Referência visual usada nesta especificação

Esta especificação foi calibrada a partir de um catálogo real fornecido
pelo usuário (`Catálogo Peças Roçadeiras`, 33 páginas, produzido no Canva).
Padrões identificados nele que moldaram o modelo de dados abaixo:

- O catálogo é dividido em **seções numeradas** (ex: "1 PARTIDA
  RETRÁTIL", "3 FILTRO DE AR, CARBURADOR E COBERTURA", "8 TUBO E EIXO
  CARDÃ"), cada uma abrindo com uma faixa de título distinta (banner
  rasgado vermelho + ilustração técnica do conjunto).
- **O layout de card varia por seção** — confirmado pelo usuário. Não
  existe um único card-molde para o catálogo inteiro; cada seção pode ter
  seu próprio desenho de card e número de colunas.
- **A quantidade de produtos por linha/página varia com o conteúdo** —
  também confirmado pelo usuário. Produtos com descrição mais longa (2 vs.
  3 linhas de texto) fazem a linha inteira da grade ficar mais alta,
  deslocando o início da linha seguinte. As colunas continuam alinhadas
  verticalmente (não é um masonry tipo Pinterest, que desalinha
  horizontalmente) — o que varia é a **altura de cada linha**, não a
  posição horizontal dos cards.

Essas duas confirmações mudam dois pontos-chave do modelo original: o
card-molde passa a pertencer a uma **Seção**, não ao catálogo inteiro; e o
motor de reflow precisa lidar com **altura de linha dinâmica**, não slots
de tamanho 100% fixo. Ver seções 2 e 3 atualizadas abaixo.

## 2. Conceito central: seções, card-molde por seção e grid com altura de linha dinâmica

### 2.1 Fluxo de criação

1. **Criar uma Seção** — cada seção representa uma categoria/conjunto do
   catálogo (ex: "Partida Retrátil", "Filtro de Ar"). A seção define seu
   próprio título, ilustração de abertura (opcional) e número de colunas.
2. **Desenhar o card da seção** — o usuário monta livremente, num canvas,
   os elementos de um produto daquela seção: foto, nome, preço,
   descrição, SKU (campos configuráveis). Posição, tamanho e estilo de
   cada elemento dentro do card ficam a critério do usuário. Esse
   card-molde vale **só para os produtos desta seção** — outra seção pode
   ter um desenho de card completamente diferente.
3. **Definir o espaçamento (gutter)** — o usuário posiciona um segundo
   card (cópia do primeiro) ao lado do primeiro, na posição que quiser
   que os cards fiquem espaçados. O sistema calcula o delta X/Y e usa
   isso como gutter horizontal/vertical daquela seção.
4. **Grid inferida por seção** — a partir do card-molde + gutter +
   colunas definidas, o sistema sabe a largura de cada coluna. A altura
   de cada linha, porém, **não é fixa** — ver 2.2.
5. **Popular com produtos reais** — a lista de produtos de cada seção é
   distribuída automaticamente pela grade, na ordem definida pelo usuário.

### 2.2 Reflow automático com altura de linha dinâmica

O motor de reflow trabalha em duas camadas:

- **Largura de coluna:** fixa, definida pelo card-molde da seção (igual
  para todos os produtos daquela seção).
- **Altura de linha:** dinâmica — calculada como a altura do card mais
  alto **entre os produtos daquela linha específica**. Se um produto tem
  descrição mais longa e o card-molde foi desenhado para acomodar texto
  de altura variável (ex: bloco de texto com altura mínima + crescimento
  conforme número de linhas), a linha toda "respira" para acomodar esse
  produto, e a linha seguinte começa depois dessa altura — exatamente o
  comportamento observado no catálogo de referência.

Isso é equivalente, em termos de CSS, a um `flex-wrap: wrap` por linha
(altura de linha = altura do maior item da linha), e não a um masonry de
colunas independentes.

Ao inserir, remover, ou reordenar um produto em qualquer posição da lista:
- O sistema recalcula a posição de **todos os produtos seguintes** dentro
  da mesma grid da seção, reagrupando em linhas e recalculando a altura de
  cada linha conforme o conteúdo de cada produto.
- Quando uma página de uma seção enche (a soma das alturas de linha
  ultrapassa a área útil), os produtos excedentes migram automaticamente
  para uma página de continuação da mesma seção (ver 3.2 sobre
  página-título vs. página de continuação).
- Este comportamento é uma consequência direta da estrutura de dados
  (lista ordenada de produtos + regras de grid da seção), não precisa de
  lógica de colisão ou física de reposicionamento.

## 3. Modelo de dados

### 3.1 Entidades principais

```
Catalog
  id
  nome
  criado_em
  atualizado_em
  page_template_default_id (FK -> PageTemplate, "padrão global de moldura de página")

Section
  id
  catalog_id (FK)
  numero                 -- ex: "1", "2", "3" (numeração exibida no título)
  titulo                 -- ex: "PARTIDA RETRÁTIL"
  ordem                   -- posição da seção na sequência do catálogo
  card_template_id (FK -> CardTemplate)  -- molde de card DESTA seção
  colunas                 -- nº de colunas da grade desta seção
  ilustracao_abertura_ref -- opcional: imagem técnica de abertura (como nos exemplos)

CardTemplate
  id
  section_id (FK)         -- pertence a uma seção específica, não ao catálogo inteiro
  layout_json             -- posições/estilo dos elementos dentro do card
  largura                 -- fixa
  altura_minima            -- altura de base do card
  altura_cresce_com        -- qual campo pode expandir o card (ex: "descricao")
  campos_habilitados       -- quais campos aparecem (foto, nome, preço, sku, descrição)
  gutter_x, gutter_y       -- inferido a partir do 2º card de exemplo
  versao                   -- incrementa a cada edição relevante (ver 3.5)
  criado_em

PageTemplate
  id
  catalog_id (FK)
  is_default              -- true = padrão global do catálogo
  tipo                     -- "abertura_secao" | "continuacao" | "capa" | "custom"
  header_json              -- elementos fixos de topo (banner de título, ilustração, logo)
  footer_json               -- elementos fixos de rodapé (numeração, contato etc.)
  margens                   -- área útil calculada a partir daqui

CatalogPage
  id
  catalog_id (FK)
  section_id (FK)           -- a qual seção esta página pertence
  ordem                      -- posição da página no catálogo
  page_template_id (FK)     -- aponta pro default OU pra um override específico
  is_override                -- true se esta página tem template próprio, distinto do default

products                     -- TABELA COMPARTILHADA (não exclusiva deste módulo)
  id
  sku, ref, nome, descricao, preco_sp, preco_pa
  foto_ref                   -- referência à foto processada no Studio de Produtos
  atualizado_em
  -- Populada por import de planilha (mesmo endpoint /parse-planilha do
  -- Gerador de Ofertas, agora fazendo upsert aqui em vez de leitura
  -- efêmera) ou cadastro manual. Usada tanto pelo Gerador de Ofertas
  -- quanto pelo Criador de Catálogos — decisão tomada para não duplicar
  -- dado de produto em dois lugares divergentes. Ver plano geral da Suite
  -- Brasmam, seção Arquitetura.

CatalogItem
  id
  section_id (FK)              -- em qual seção do catálogo este produto aparece
  product_id (FK -> products)  -- referência ao produto real (nome/sku/preço/foto vêm daqui)
  ordem                         -- posição do item na sequência da seção
  card_template_versao          -- qual versão do card-molde foi usada quando posicionado (ver 3.5)
```

### 3.2 Por que o card-molde virou propriedade da Seção

Confirmado pelo usuário: seções diferentes do mesmo catálogo têm cards
visualmente distintos (ex: a seção de eixos/tubos usa cards mais
alongados horizontalmente que a seção de retentores/juntas, que são mais
quadrados). Modelar `CardTemplate` como filho de `Section` — em vez de
filho de `Catalog` — permite que cada seção seja desenhada e ajustada de
forma independente, sem afetar as demais, mantendo o mesmo mecanismo de
"desenhar 2 cards de exemplo para inferir gutter" descrito em 2.1.

### 3.3 Override de página (título de seção vs. continuação)

Cada `CatalogPage` referencia um `PageTemplate` e pertence a uma `Section`.
Por padrão, a **primeira página de cada seção** usa um `PageTemplate` do
tipo `abertura_secao` (com o banner de título + ilustração, como visto no
catálogo de referência), enquanto páginas adicionais da mesma seção — caso
os produtos não caibam numa página só — usam um `PageTemplate` do tipo
`continuacao` (moldura mais simples, sem repetir o banner de abertura).
Isso é resolvido pelo mesmo mecanismo de override já previsto: o sistema
atribui automaticamente o tipo de `PageTemplate` conforme a posição da
página dentro da seção, mas o usuário pode sobrescrever manualmente
qualquer página específica se quiser uma variação pontual.

### 3.4 Reflow: algoritmo em alto nível (com altura de linha dinâmica)

```
function reflow(catalog):
  for section in get_sections_ordenadas(catalog):
    produtos = get_products_ordenados(section)
    paginas = get_paginas_ordenadas(section)
    indice_produto = 0

    for pagina in paginas:
      template = pagina.page_template  // abertura_secao, continuacao ou override
      area_util_restante = calcular_area_util(template, section.card_template)
      linha_atual = []

      while indice_produto < len(produtos) and area_util_restante > 0:
        produto = produtos[indice_produto]
        template_do_produto = get_card_template_versao(section, produto.card_template_versao)
                      // NÃO necessariamente section.card_template (versão vigente) —
                      // ver 3.5: um produto posicionado antes de uma edição "só novos"
                      // continua usando a versão do molde que tinha quando foi
                      // posicionado. A largura de coluna vem sempre da seção (é fixa
                      // e não versionada), só altura_minima/altura_cresce_com variam
                      // por versão do template.
        altura_card = calcular_altura(produto, template_do_produto)
                      // altura_minima + crescimento conforme descricao, etc.

        linha_atual.append(produto)

        if len(linha_atual) == section.colunas:
          altura_linha = max(
            calcular_altura(p, get_card_template_versao(section, p.card_template_versao))
            for p in linha_atual
          )
          if altura_linha > area_util_restante:
            break  // linha não cabe, sobra pra próxima página
          posicionar_linha(linha_atual, pagina, altura_linha)
          area_util_restante -= altura_linha
          linha_atual = []

        indice_produto += 1

    // se sobraram produtos além das páginas existentes desta seção:
    while indice_produto < len(produtos):
      nova_pagina = criar_pagina(section, template: tipo="continuacao")
      // repete o loop interno de posicionamento pra nova_pagina
```

O ponto central: a altura de cada linha só é conhecida **depois** de
montar a linha inteira (é o máximo entre os cards daquela linha) — por
isso o algoritmo acumula produtos numa `linha_atual` antes de decidir a
altura final e descontar da área útil da página. Isso está de acordo com
o comportamento de "flex-wrap por linha" descrito em 2.2.

**Correção em relação à primeira versão deste algoritmo:** o cálculo de
altura de cada card usa a versão do `CardTemplate` **daquele produto**
(`produto.card_template_versao`), não necessariamente a versão vigente da
seção — isso é o que torna possível a coexistência descrita em 3.5 (molde
v1 e v2 na mesma página) sem quebrar o cálculo de altura de linha. A
largura de coluna, por outro lado, nunca é versionada — vem sempre da
seção, igual para todos os produtos independente de qual versão do molde
cada um usa.

Esse é o núcleo do "não precisa mudar toda a estrutura ao incluir um
produto": inserir um produto na posição N da lista da seção apenas
desloca os índices seguintes — o algoritmo acima roda de novo (é barato
computacionalmente, mesmo com centenas de produtos) e todo mundo
"escorre" pra frente ou pra trás automaticamente, inclusive migrando de
página quando necessário.

### 3.5 Edição do card-molde depois de já existirem páginas geradas

Quando o usuário edita o `CardTemplate` de uma seção (ex.: muda o tamanho
da foto dentro do card daquela seção), o sistema pergunta **no momento da
execução**:

- **"Aplicar a todos os produtos existentes desta seção"** — reprocessa
  `reflow()` da seção inteira usando a nova versão do `CardTemplate` para
  todos os produtos já posicionados (o reflow pode inclusive mudar
  quantas linhas cabem por página, disparando reflow completo da seção).
- **"Aplicar só aos novos"** — itens já existentes mantêm a referência
  à versão anterior do `CardTemplate` (campo
  `CatalogItem.card_template_versao` não muda); só itens adicionados
  **depois** dessa edição usam a nova versão. Isso implica que uma mesma
  página pode, temporariamente, ter cards com o "molde v1" ao lado de
  cards com "molde v2" da mesma seção — o sistema precisa suportar isso
  visualmente sem quebrar o grid (cada card renderiza conforme sua
  própria versão; a largura de coluna vem sempre da seção, igual pra
  todos, mas a altura de linha é recalculada por item conforme sua
  própria versão do molde — ver correção no algoritmo em 3.4).

Essa escolha fica a critério do usuário a cada edição — não é uma regra
fixa do sistema, como decidido. A edição afeta apenas a seção em questão;
outras seções do catálogo não são impactadas.

## 4. Integração com o Foto Studio e com a tabela `products` compartilhada

- **Decisão tomada:** `nome`/`sku`/`ref`/`descrição`/`preço`/`foto_ref` não
  pertencem mais ao Criador de Catálogos — vêm da tabela `products`,
  **compartilhada com o Gerador de Ofertas** (ver plano geral da Suite
  Brasmam). O `CatalogItem` de cada seção só guarda a referência
  (`product_id`) mais o que é específico do catálogo (`ordem`,
  `card_template_versao`).
- `products.foto_ref` aponta pra biblioteca já processada pelo Studio de
  Produtos (fundo removido, editada, com marca d'água se aplicável) —
  mesmo padrão de reaproveitamento já usado entre Studio → Gerador de
  Ofertas.
- O Criador de Catálogos **não duplica** upload de imagem — ele referencia
  o asset já existente no R2 (bucket da Suite Brasmam) através do
  `product_id` escolhido.
- `products` é populada por import de planilha (endpoint `/parse-planilha`
  já existente, agora fazendo upsert nessa tabela em vez de leitura
  efêmera — mesmo padrão Excel COD/REF/DESCRIÇÃO/PREÇO usado no Gerador de
  Ofertas) ou cadastro manual — de qualquer um dos dois módulos, já que a
  tabela é a mesma.

## 5. Stack técnica (reaproveitando o que já está validado na Suite Brasmam)

- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind v4 — mesmo
  projeto `brasmam-studio`, como um novo grupo de rotas
  `src/app/(app)/catalogos/`.
- **Editor de canvas:** `react-konva` + `konva` — já instalados no
  projeto (previstos originalmente para o editor do Studio, fase 2), e
  perfeitamente adequados para o canvas livre de desenho do card-molde e
  do header/footer da página.
- **Drag-and-drop / reordenação de produtos:** `@dnd-kit/core` +
  `@dnd-kit/sortable` — já instalados, ideais para reordenar produtos na
  lista (disparando o reflow).
- **Geração do PDF final: decidido — `reportlab`**, server-side, novo
  endpoint `POST /generate-catalog-pdf` no mesmo backend FastAPI já
  existente. Preferido a `weasyprint` porque o editor é posicionamento
  livre em canvas/coordenada absoluta (estilo Canva) — reportlab desenha
  por x/y exato, o que reproduz o canvas ponto a ponto; weasyprint é
  fluxo HTML/CSS, mais natural pra texto corrido do que pra replicar um
  layout de coordenada absoluta.
- **Banco de dados:** Supabase (Postgres) — mesmo projeto da Suite
  Brasmam (separado do CRM), novas tabelas conforme seção 3 (`Catalog`,
  `Section`, `CardTemplate`, `PageTemplate`, `CatalogPage`, `CatalogItem`)
  mais a tabela `products` **já compartilhada** com o Gerador de Ofertas
  (não é nova deste módulo).
- **Armazenamento:** Cloudflare R2 — mesmo bucket da Suite Brasmam,
  referenciando fotos já processadas pelo Studio.

## 6. Fases sugeridas de implementação

1. **Esqueleto do módulo** — rota `/catalogos`, listagem de catálogos,
   modelo de dados criado no Supabase (tabelas da seção 3, incluindo
   `Section`).
2. **Editor de seções** — CRUD de seções (título, numeração, ordem),
   cada uma com seu próprio `CardTemplate`.
3. **Editor de card-molde por seção** — canvas (konva) pra desenhar o
   card livre daquela seção, captura de gutter via segundo card de
   exemplo, definição de colunas e de qual campo pode crescer em altura
   (ex: descrição).
4. **Editor de página (header/footer)** — canvas pra moldura fixa da
   página, com os tipos `abertura_secao` e `continuacao`, e suporte a
   override por página específica.
5. **Motor de reflow com altura de linha dinâmica** — algoritmo da seção
   3.4, com CRUD de produtos (inserir/remover/reordenar) disparando
   recálculo automático por seção.
6. **Edição de card-molde pós-criação** — lógica de "aplicar a todos vs.
   só novos" por seção (seção 3.5).
7. **Geração de PDF final** — exportação do catálogo completo.
8. **Integração fina com Foto Studio** — busca de produtos (com foto já
   processada) direto da tabela `products` compartilhada, de dentro do
   editor de card.

## 7. Decisões já tomadas (não reabrir sem motivo novo)

- Módulo **separado do Cadência CRM**, integrado apenas à Suite Brasmam
  (Foto Studio) — decisão explícita do usuário.
- Catálogo é dividido em **seções**, e o card-molde pertence à seção,
  não ao catálogo inteiro — cada seção pode ter card e nº de colunas
  próprios, confirmado a partir do catálogo de referência.
- Card de produto é um **molde único e repetível dentro de sua seção**,
  não uma página desenhada livremente produto por produto — decisão
  tomada para manter o reflow automático confiável.
- A grade tem **largura de coluna fixa** mas **altura de linha
  dinâmica** (calculada como o máximo entre os cards de cada linha) —
  confirmado que a quantidade de produtos por página varia com o
  conteúdo.
- Gutter/espaçamento é **inferido** a partir de dois cards de exemplo
  posicionados pelo usuário, não configurado via campo numérico abstrato.
- Layout de página tem tipos padrão (`abertura_secao`, `continuacao`),
  mas suporta **override por página individual**.
- Reaplicação do card-molde editado a produtos existentes é uma **escolha
  do usuário a cada execução** (aplicar a todos vs. só aos novos, por
  seção), não uma regra fixa do sistema.
- **Tabela `products` é compartilhada** com o Gerador de Ofertas (não
  exclusiva deste módulo) — populada por `/parse-planilha` (upsert) ou
  cadastro manual, evita duplicar nome/sku/preço/foto em dois lugares
  divergentes. `CatalogItem` referencia `product_id`, não guarda esses
  campos direto.
- **Geração de PDF: `reportlab`**, decidido — preferido a `weasyprint`
  pela fidelidade a posicionamento por coordenada absoluta (ver seção 5).
- Cálculo de altura de linha no reflow usa a **versão do `CardTemplate` de
  cada item individualmente** (`CatalogItem.card_template_versao`), não a
  versão vigente da seção — correção aplicada ao algoritmo da seção 3.4
  para ser consistente com a coexistência de versões descrita em 3.5.
