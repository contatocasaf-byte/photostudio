"use client";

import { useState, type ReactNode } from "react";
import {
  DEFAULT_FONT_FAMILY,
  PAGE_FIELD_DEFS,
  PAGE_PLACEHOLDERS,
  PAGE_SHAPE_TYPES,
  PAGE_SIZE_PRESETS,
  mmToPx,
  presetToPx,
  pxToMm,
  type Margens,
  type PageFieldKey,
  type PageIllustration,
  type PageImageElementConfig,
  type PageLayout,
  type PageShape,
  type PageShapeType,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
import { ColorField, NumberField, OpacityField, PanelCard, Secao, UnitToggle, type Unidade } from "../../../core/PainelUi";
import { getPageAssetUploadUrl } from "../../../paginas/actions";
import { getPublicUrl } from "@/lib/storage/public-url";
import type { TextAlign } from "@/lib/canvasText";
import FilePickerZone from "@/components/FilePickerZone";
import FontPicker from "@/components/fonts/FontPicker";

type Props = {
  // Canvas do editor — este componente monta o layout da tela inteira (canvas +
  // painel de propriedades ao lado + lista de elementos embaixo), então recebe
  // o canvas pronto.
  canvas: ReactNode;
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  onToggleElemento: (key: PageFieldKey, habilitado: boolean) => void;
  selectedKey: PageFieldKey | null;
  onSelectKey: (key: PageFieldKey | null) => void;
  onUpdateField: (key: PageFieldKey, patch: Partial<PageImageElementConfig & PageTextElementConfig>) => void;
  largura: number;
  altura: number;
  onResizeBoundary: (patch: { largura: number; altura: number }) => void;
  margens: Margens;
  onChangeMargens: (patch: Partial<Margens>) => void;
  fundoUrl: string | null;
  // fundoPdfKey: chave do PDF ORIGINAL no R2 quando o fundo foi
  // enviado como PDF (Fase 5, Parte 17) — null pra fundo em imagem
  // comum. Só usado aqui pra mostrar um aviso; o desenho em tela
  // sempre usa fundoUrl (o PNG rasterizado), igual antes.
  fundoPdfKey: string | null;
  onChangeFundo: (patch: { key: string | null; url: string | null; pdfKey: string | null }) => void;
  illustracoes: PageIllustration[];
  onAddIllustracao: () => void;
  onRemoveIllustracao: (id: string) => void;
  onUpdateIllustracao: (id: string, patch: Partial<PageIllustration>) => void;
  selectedIllustrationId: string | null;
  onSelectIllustration: (id: string | null) => void;
  formas: PageShape[];
  onAddForma: (type: PageShapeType) => void;
  onRemoveForma: (id: string) => void;
  onUpdateForma: (id: string, patch: Partial<PageShape>) => void;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
};

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

// Layout dos editores de modelo de página (mesma organização do card-molde):
// canvas em cima à esquerda; UM painel de propriedades ao lado do canvas
// (acompanha a rolagem) que mostra a "Estrutura da página" quando nada está
// selecionado e as propriedades do elemento/ilustração/forma selecionado nos
// demais casos; e, embaixo do canvas, o cartão "Página" com as listas.
export default function PropertiesPanel({
  canvas,
  layout,
  elementosHabilitados,
  onToggleElemento,
  selectedKey,
  onSelectKey,
  onUpdateField,
  largura,
  altura,
  onResizeBoundary,
  margens,
  onChangeMargens,
  fundoUrl,
  fundoPdfKey,
  onChangeFundo,
  illustracoes,
  onAddIllustracao,
  onRemoveIllustracao,
  onUpdateIllustracao,
  selectedIllustrationId,
  onSelectIllustration,
  formas,
  onAddForma,
  onRemoveForma,
  onUpdateForma,
  selectedShapeId,
  onSelectShape,
}: Props) {
  const selectedDef = selectedKey ? PAGE_FIELD_DEFS.find((d) => d.key === selectedKey) : null;
  const selectedIllustration = selectedIllustrationId ? illustracoes.find((i) => i.id === selectedIllustrationId) : null;
  const selectedShape = selectedShapeId ? formas.find((s) => s.id === selectedShapeId) : null;
  const nadaSelecionado = !selectedDef && !selectedIllustration && !selectedShape;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unidade>("px");

  function toDisplay(px: number) {
    return unit === "mm" ? pxToMm(px) : Math.round(px);
  }
  function fromDisplay(v: number) {
    return unit === "mm" ? mmToPx(v) : Math.round(v);
  }

  function limparSelecao() {
    onSelectKey(null);
    onSelectIllustration(null);
    onSelectShape(null);
  }

  async function uploadAsset(file: File): Promise<{ key: string; url: string }> {
    const { url: uploadUrl, key, error } = await getPageAssetUploadUrl({ fileName: file.name, contentType: file.type });
    if (error || !uploadUrl || !key) throw new Error(error ?? "Falha ao gerar URL de upload.");

    const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) throw new Error("Falha no upload pro R2.");

    return { key, url: getPublicUrl(key) };
  }

  // Rasteriza a 1ª página de um PDF já enviado pro R2 (backend Python,
  // via proxy Next.js) — só pra ter uma imagem pra desenhar no editor/
  // preview (Konva não sabe renderizar PDF). O PDF original continua
  // intacto no R2 (ver handleUploadFundo) e é isso que a exportação de
  // PDF final usa de verdade, mesclado como camada vetorial.
  async function renderPdfBackground(pdfKey: string, width: number, height: number): Promise<{ key?: string; error?: string }> {
    const res = await fetch("/api/catalogos/render-pdf-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: pdfKey, width: Math.round(width), height: Math.round(height) }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Falha ao converter PDF." };
    return { key: data.resultKey as string };
  }

  // Plano de fundo aceita PDF além de imagem (Fase 5, Parte 17) — sem
  // perda de qualidade no PDF final: sobe o PDF original de verdade
  // (uploadAsset já é genérico por content-type) e gera uma prévia
  // rasterizada só pra desenhar em tela.
  async function handleUploadFundo(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const { key: pdfKey } = await uploadAsset(file);
        const { key: pngKey, error } = await renderPdfBackground(pdfKey, largura, altura);
        if (error || !pngKey) throw new Error(error ?? "Falha ao converter o PDF.");
        onChangeFundo({ key: pngKey, url: getPublicUrl(pngKey), pdfKey });
      } else {
        const { key, url } = await uploadAsset(file);
        onChangeFundo({ key, url, pdfKey: null });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadImage(fileList: FileList) {
    if (!selectedKey) return;
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { key, url } = await uploadAsset(file);
      onUpdateField(selectedKey, { key, url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadIllustracao(fileList: FileList) {
    if (!selectedIllustrationId) return;
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { key, url } = await uploadAsset(file);
      onUpdateIllustracao(selectedIllustrationId, { key, url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  const botaoLista = (ativo: boolean) =>
    "rounded-md px-2 py-1.5 text-left text-xs font-medium " + (ativo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700");

  // ---------- Estrutura da página (nada selecionado) ----------
  const estrutura = (
    <PanelCard titulo="Estrutura da página" acao={<UnitToggle unit={unit} onChange={setUnit} />}>
      <Secao titulo="Tamanho">
        <p className="mb-2 text-[11px] text-slate-400">Vale pra todos os modelos deste catálogo.</p>
        <div className="flex flex-col gap-2">
          <select
            value={
              PAGE_SIZE_PRESETS.find((p) => {
                const px = presetToPx(p);
                return px.largura === Math.round(largura) && px.altura === Math.round(altura);
              })?.key ?? ""
            }
            onChange={(e) => {
              const preset = PAGE_SIZE_PRESETS.find((p) => p.key === e.target.value);
              if (preset) onResizeBoundary(presetToPx(preset));
            }}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">Personalizado</option>
            {(["Papel", "Redes sociais"] as const).map((group) => (
              <optgroup key={group} label={group}>
                {PAGE_SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <NumberField
            label={`Largura (${unit})`}
            value={toDisplay(largura)}
            onCommit={(v) => onResizeBoundary({ largura: Math.max(fromDisplay(v), 200), altura })}
          />
          <NumberField
            label={`Altura (${unit})`}
            value={toDisplay(altura)}
            onCommit={(v) => onResizeBoundary({ largura, altura: Math.max(fromDisplay(v), 200) })}
          />
        </div>
      </Secao>

      <Secao titulo="Margens">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={`Topo (${unit})`}
            value={toDisplay(margens.top)}
            onCommit={(v) => onChangeMargens({ top: Math.max(0, fromDisplay(v)) })}
          />
          <NumberField
            label={`Base (${unit})`}
            value={toDisplay(margens.bottom)}
            onCommit={(v) => onChangeMargens({ bottom: Math.max(0, fromDisplay(v)) })}
          />
          <NumberField
            label={`Esquerda (${unit})`}
            value={toDisplay(margens.left)}
            onCommit={(v) => onChangeMargens({ left: Math.max(0, fromDisplay(v)) })}
          />
          <NumberField
            label={`Direita (${unit})`}
            value={toDisplay(margens.right)}
            onCommit={(v) => onChangeMargens({ right: Math.max(0, fromDisplay(v)) })}
          />
        </div>
      </Secao>

      <Secao titulo="Plano de fundo">
        <div className="flex flex-col gap-2">
          {fundoUrl && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fundoUrl} alt="Plano de fundo" className="h-14 w-14 rounded border border-slate-200 object-cover" />
              <div className="flex flex-col gap-1">
                {fundoPdfKey && (
                  <span className="w-fit rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    PDF — prévia rasterizada
                  </span>
                )}
                <button
                  onClick={() => onChangeFundo({ key: null, url: null, pdfKey: null })}
                  className="w-fit rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Remover
                </button>
              </div>
            </div>
          )}
          <FilePickerZone
            disabled={uploading}
            accept="image/*,application/pdf"
            title="Arraste uma imagem ou PDF aqui ou clique para escolher"
            subtitle="Cobre a página inteira, atrás dos elementos — PDF mantém qualidade vetorial no PDF final"
            buttonLabel={uploading ? "Enviando..." : fundoUrl ? "Trocar arquivo" : "Escolher arquivo"}
            onFiles={handleUploadFundo}
          />
          {uploadError && nadaSelecionado && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      </Secao>
    </PanelCard>
  );

  // ---------- Lista de elementos (embaixo do canvas) ----------
  const lista = (
    <PanelCard titulo="Página">
      <Secao titulo="Estrutura">
        <button
          onClick={limparSelecao}
          className={"flex w-full items-center gap-2 " + botaoLista(nadaSelecionado) + (nadaSelecionado ? "" : " hover:bg-slate-200")}
        >
          Estrutura da página
          <span className={"ml-auto text-[10px] font-normal " + (nadaSelecionado ? "text-slate-300" : "text-slate-400")}>
            tamanho, margens, fundo
          </span>
        </button>
      </Secao>

      <Secao titulo="Elementos">
        <div className="flex flex-col gap-1">
          {PAGE_FIELD_DEFS.map((def) => {
            const habilitado = elementosHabilitados.includes(def.key);
            return (
              <div
                key={def.key}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                  (selectedKey === def.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")
                }
              >
                <input
                  type="checkbox"
                  checked={habilitado}
                  onChange={(e) => onToggleElemento(def.key, e.target.checked)}
                  className="shrink-0"
                />
                <button
                  onClick={() => {
                    if (!habilitado) return;
                    onSelectIllustration(null);
                    onSelectShape(null);
                    onSelectKey(def.key);
                  }}
                  disabled={!habilitado}
                  className={"flex-1 text-left text-xs font-medium " + (habilitado ? "" : "opacity-40")}
                >
                  {def.label}
                </button>
                <span className="shrink-0 text-[10px] uppercase text-slate-400">{def.zone === "header" ? "topo" : "rodapé"}</span>
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao
        titulo="Ilustrações"
        acao={
          <button
            onClick={onAddIllustracao}
            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            + Ilustração
          </button>
        }
      >
        {illustracoes.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma ilustração.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {illustracoes.map((ill, i) => (
              <button
                key={ill.id}
                onClick={() => {
                  onSelectKey(null);
                  onSelectShape(null);
                  onSelectIllustration(ill.id);
                }}
                className={botaoLista(selectedIllustrationId === ill.id)}
              >
                Ilustração {i + 1}
              </button>
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Formas">
        <div className="grid grid-cols-3 gap-1">
          {PAGE_SHAPE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onAddForma(t.value)}
              className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              + {t.label}
            </button>
          ))}
        </div>
        {formas.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {formas.map((shape, i) => {
              const def = PAGE_SHAPE_TYPES.find((t) => t.value === shape.type);
              return (
                <button
                  key={shape.id}
                  onClick={() => {
                    onSelectKey(null);
                    onSelectIllustration(null);
                    onSelectShape(shape.id);
                  }}
                  className={"flex items-center gap-2 " + botaoLista(selectedShapeId === shape.id)}
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-400" style={{ backgroundColor: shape.color }} />
                  {def?.label ?? shape.type} {i + 1}
                </button>
              );
            })}
          </div>
        )}
      </Secao>
    </PanelCard>
  );

  // ---------- Elemento selecionado ----------
  const botaoExcluir = (rotulo: string, onClick: () => void) => (
    <button onClick={onClick} className="text-xs font-medium text-red-600 hover:text-red-800">
      {rotulo}
    </button>
  );

  const posicaoETamanho = (cfg: { x: number; y: number; w: number; h: number }, minimo: number, onUpdate: (patch: { x?: number; y?: number; w?: number; h?: number }) => void) => (
    <Secao titulo="Posição e tamanho">
      <div className="flex flex-col gap-2">
        <NumberField label={`Posição X (${unit})`} value={toDisplay(cfg.x)} onCommit={(v) => onUpdate({ x: fromDisplay(v) })} />
        <NumberField label={`Posição Y (${unit})`} value={toDisplay(cfg.y)} onCommit={(v) => onUpdate({ y: fromDisplay(v) })} />
        <NumberField label={`Largura (${unit})`} value={toDisplay(cfg.w)} onCommit={(v) => onUpdate({ w: Math.max(minimo, fromDisplay(v)) })} />
        <NumberField label={`Altura (${unit})`} value={toDisplay(cfg.h)} onCommit={(v) => onUpdate({ h: Math.max(minimo, fromDisplay(v)) })} />
      </div>
    </Secao>
  );

  const nomeSelecionado =
    selectedDef?.label ?? (selectedIllustration ? "Ilustração" : (PAGE_SHAPE_TYPES.find((t) => t.value === selectedShape?.type)?.label ?? "Forma"));

  const selecionado = (
    <PanelCard titulo="Elemento selecionado" destaque acao={<UnitToggle unit={unit} onChange={setUnit} />}>
      <Secao>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">{nomeSelecionado}</p>
          {selectedShape && botaoExcluir("Excluir", () => onRemoveForma(selectedShape.id))}
          {selectedIllustration && botaoExcluir("Excluir", () => onRemoveIllustracao(selectedIllustration.id))}
        </div>
      </Secao>

      {selectedShape && (
        <>
          {posicaoETamanho(selectedShape, 4, (patch) => onUpdateForma(selectedShape.id, patch))}
          <Secao titulo="Aparência">
            <div className="flex flex-col gap-3">
              <ColorField label="Cor" value={selectedShape.color} onChange={(color) => onUpdateForma(selectedShape.id, { color })} />
              <OpacityField value={selectedShape.opacity} onChange={(opacity) => onUpdateForma(selectedShape.id, { opacity })} />
            </div>
          </Secao>
        </>
      )}

      {selectedIllustration && (
        <>
          <Secao titulo="Imagem">
            <FilePickerZone
              disabled={uploading}
              title="Arraste uma imagem aqui ou clique para escolher"
              subtitle="Substitui o arquivo atual desta ilustração"
              buttonLabel={uploading ? "Enviando..." : "Escolher arquivo"}
              onFiles={handleUploadIllustracao}
            />
            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
          </Secao>
          {posicaoETamanho(selectedIllustration, 20, (patch) => onUpdateIllustracao(selectedIllustration.id, patch))}
        </>
      )}

      {selectedDef && selectedDef.type === "image" && (
        <>
          <Secao titulo="Imagem">
            <FilePickerZone
              disabled={uploading}
              title="Arraste uma imagem aqui ou clique para escolher"
              subtitle="Substitui o arquivo atual deste elemento"
              buttonLabel={uploading ? "Enviando..." : "Escolher arquivo"}
              onFiles={handleUploadImage}
            />
            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
          </Secao>
          {posicaoETamanho(layout[selectedDef.key] as PageImageElementConfig, 20, (patch) => onUpdateField(selectedDef.key, patch))}
        </>
      )}

      {selectedDef && selectedDef.type === "text" && (
        <TextProperties
          fieldKey={selectedDef.key}
          cfg={layout[selectedDef.key] as PageTextElementConfig}
          unit={unit}
          toDisplay={toDisplay}
          fromDisplay={fromDisplay}
          onUpdate={(patch) => onUpdateField(selectedDef.key, patch)}
        />
      )}
    </PanelCard>
  );

  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4">
      <div className="col-start-1 row-start-1 min-w-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{canvas}</div>

      <div className="sticky top-4 col-start-2 row-span-2 row-start-1 max-h-[calc(100vh-2rem)] self-start overflow-y-auto">
        {nadaSelecionado ? estrutura : selecionado}
      </div>

      <div className="col-start-1 row-start-2 min-w-0">{lista}</div>
    </div>
  );
}

function TextProperties({
  fieldKey,
  cfg,
  unit,
  toDisplay,
  fromDisplay,
  onUpdate,
}: {
  fieldKey: PageFieldKey;
  cfg: PageTextElementConfig;
  unit: Unidade;
  toDisplay: (px: number) => number;
  fromDisplay: (v: number) => number;
  onUpdate: (patch: Partial<PageTextElementConfig>) => void;
}) {
  const placeholders = PAGE_PLACEHOLDERS[fieldKey];
  const botao = (ativo: boolean) =>
    "rounded-md px-2 py-1 text-xs font-medium " + (ativo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200");

  return (
    <>
      <Secao titulo="Conteúdo">
        <label className="text-xs text-slate-500">Texto</label>
        <input
          key={cfg.text}
          defaultValue={cfg.text}
          onBlur={(e) => onUpdate({ text: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        {placeholders && placeholders.length > 0 ? (
          <p className="mt-1 text-[11px] text-slate-400">
            Pode usar:{" "}
            {placeholders.map((p) => (
              <code key={p} className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">
                {p}
              </code>
            ))}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">Texto fixo — o mesmo em toda página.</p>
        )}
      </Secao>

      <Secao titulo="Fonte">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500">Fonte</label>
            <FontPicker
              family={cfg.fontFamily ?? DEFAULT_FONT_FAMILY}
              weight={cfg.fontWeight === "bold" ? 700 : 400}
              onSelect={(fam, w) => onUpdate({ fontFamily: fam, fontWeight: w === 700 ? "bold" : "normal" })}
            />
          </div>
          <NumberField label="Tamanho da fonte (px)" value={cfg.fontSize} onCommit={(v) => onUpdate({ fontSize: Math.max(8, v) })} />
          <div>
            <label className="text-xs text-slate-500">Peso da fonte</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button onClick={() => onUpdate({ fontWeight: "normal" })} className={botao(cfg.fontWeight === "normal")}>
                Normal
              </button>
              <button onClick={() => onUpdate({ fontWeight: "bold" })} className={botao(cfg.fontWeight === "bold")}>
                Negrito
              </button>
            </div>
          </div>
          <ColorField label="Cor" value={cfg.color} onChange={(color) => onUpdate({ color })} />
        </div>
      </Secao>

      <Secao titulo="Posição e caixa">
        <div className="flex flex-col gap-3">
          <NumberField label={`Posição X (${unit})`} value={toDisplay(cfg.x)} onCommit={(v) => onUpdate({ x: fromDisplay(v) })} />
          <NumberField label={`Posição Y (${unit})`} value={toDisplay(cfg.y)} onCommit={(v) => onUpdate({ y: fromDisplay(v) })} />
          <NumberField
            label={`Largura máxima (${unit})`}
            value={toDisplay(cfg.maxW)}
            onCommit={(v) => onUpdate({ maxW: Math.max(40, fromDisplay(v)) })}
          />
          <div>
            <label className="text-xs text-slate-500">Número de linhas</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => onUpdate({ maxLines: n })} className={"flex-1 " + botao(cfg.maxLines === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Alinhamento</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {ALIGN_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => onUpdate({ align: opt.value })} className={botao(cfg.align === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Secao>
    </>
  );
}
