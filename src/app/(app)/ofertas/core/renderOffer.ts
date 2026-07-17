// Porta render_canvas (core.py:767-817) pra Canvas 2D. `safe_font` do
// original (tenta carregar um .ttf, cai pra Arial/DejaVu) virou a
// biblioteca de fontes (ver fonts/googleFonts.ts e fonts/fontLoader.ts):
// cada elemento de texto guarda um fontFamily real na config, que
// precisa estar carregado (ensureFontLoaded) ANTES de chamar
// renderOffer. A lógica de encolher/quebrar/alinhar texto
// (wrapTextToLines/drawTextFit, porta original de _wrap_text_to_lines/
// draw_text_fit, core.py:641-766) foi promovida pra src/lib/canvasText.ts
// — reaproveitada também pelo card-molde do Criador de Catálogos.
import {
  type ElementKey,
  type ImageElementConfig,
  type LayoutConfig,
  type TextElementConfig,
  DEFAULT_FONT_FAMILY,
  substitutePlaceholders,
} from "./layoutConfig";
import { fitImageOnCanvas, type ProductTransform } from "./fitImageOnCanvas";
import { formatarPrecoBR } from "./priceFormat";
import { drawTextFit } from "@/lib/canvasText";

export { drawTextFit };

export type RenderOfferParams = {
  layoutImg: HTMLImageElement;
  cfg: LayoutConfig;
  productCanvas: HTMLCanvasElement | null;
  ref: string;
  desc: string;
  precoSp: string;
  precoPa: string;
  dataIni: string; // já formatado, ex: "01/01/2026"
  dataFim: string;
  mostrarPrecos: boolean;
  productTransform?: ProductTransform;
};

// Monta a imagem final a partir da configuração do layout. As dimensões
// do arquivo de layout são sempre preservadas (sem esticar/encolher) —
// o canvas nasce do tamanho exato de `layoutImg`.
export function renderOffer(params: RenderOfferParams): HTMLCanvasElement {
  const { layoutImg, cfg, productCanvas, ref, desc, precoSp, precoPa, dataIni, dataFim, mostrarPrecos, productTransform } =
    params;

  const canvas = document.createElement("canvas");
  canvas.width = layoutImg.naturalWidth;
  canvas.height = layoutImg.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  // Fundo branco antes do layout — só por segurança caso o PNG do
  // layout tenha alguma transparência residual (JPEG final não tem
  // canal alfa; sem isso, área transparente viraria preto na exportação).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layoutImg, 0, 0);

  if (productCanvas) {
    const pb = cfg.product_box as ImageElementConfig;
    const prodFit = fitImageOnCanvas(productCanvas, pb.w, pb.h, productTransform);
    ctx.drawImage(prodFit, pb.x, pb.y);
  }

  // Valores disponíveis pra substituir nos templates editáveis de cada
  // elemento (ver layoutConfig.ts, ELEMENT_PLACEHOLDERS) — troca o
  // "Preço SP"/"R$ 99,90" hardcoded do app original por texto
  // configurável por layout.
  const values: Record<string, string> = {
    ref,
    desc,
    preco_sp: formatarPrecoBR(precoSp),
    preco_pa: formatarPrecoBR(precoPa),
    data_ini: dataIni,
    data_fim: dataFim,
  };

  const keysToRender: ElementKey[] = mostrarPrecos
    ? ["ref_pos", "desc_pos", "label_sp_pos", "price_sp_pos", "label_pa_pos", "price_pa_pos", "validity_pos"]
    : ["ref_pos", "desc_pos"];

  for (const key of keysToRender) {
    const c = cfg[key] as TextElementConfig;
    const text = substitutePlaceholders(c.text ?? "", values);
    drawTextFit(
      ctx,
      text,
      c.fontFamily ?? DEFAULT_FONT_FAMILY,
      c.fontWeight ?? "normal",
      c.fontSize ?? 24,
      c.maxW ?? 500,
      c.x ?? 0,
      c.y ?? 0,
      c.color ?? "#FFFFFF",
      c.align ?? "left",
      c.maxLines ?? 1
    );
  }

  return canvas;
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar JPEG."))), "image/jpeg", quality);
  });
}
