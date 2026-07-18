// Promovido pra src/lib/fitImageOnCanvas.ts — o campo "Ilustração" do
// editor de página do Criador de Catálogos também precisa da mesma
// lógica de "encaixar sem cortar o objeto visível" (mesmo raciocínio
// já aplicado a drawTextFit/loadImage). Reexportado aqui pra não
// quebrar quem já importa daqui.
export type { BBox, ProductTransform } from "@/lib/fitImageOnCanvas";
export { getOpaqueBBox, getContentCenter, fitImageOnCanvas, loadImageToCanvas } from "@/lib/fitImageOnCanvas";
export { loadImage } from "@/lib/loadImage";
