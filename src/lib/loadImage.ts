// Carrega uma URL como HTMLImageElement — genérico, sem nada
// específico de oferta. Extraído de ofertas/core/fitImageOnCanvas.ts
// pra ser reaproveitado também pelos campos de imagem do editor de
// página do Criador de Catálogos (banner/ilustração/logo, assets
// reais enviados pro R2).
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
