import type { PhotoTransform } from "../PhotoAdjustWidget";

export type BatchItemStatus = "pendente" | "gerando" | "pronto" | "erro";

export type BatchItem = {
  id: string;
  codigo: string;
  ref: string;
  desc: string;
  precoSp: string;
  precoPa: string;
  included: boolean;
  // Foto achada automaticamente na pasta (por código) — resolvida uma
  // vez no carregamento do lote. Manual tem prioridade sobre ela,
  // igual ao original (BatchItem.foto_path, batch_generator.py:39-42).
  fotoAutoUrl: string | null;
  fotoManualUrl: string | null;
  fotoManualName: string | null;
  transform: PhotoTransform;
  status: BatchItemStatus;
  resultBlob?: Blob;
  error?: string;
};

export function currentFotoUrl(item: BatchItem): string | null {
  return item.fotoManualUrl ?? item.fotoAutoUrl;
}
