"use client";

import { useRef } from "react";

type Props = {
  label: string;
  count: number;
  onFiles: (files: FileList) => void;
};

// Seleciona uma pasta inteira via <input webkitdirectory> — não é um
// atributo React padrão, por isso vai via callback ref em vez de prop
// JSX (evita cast de tipo). Sem arrastar-e-soltar aqui: navegador não
// tem uma API simples pra "soltar uma pasta inteira", diferente de
// arquivos soltos (FilePickerZone).
export default function FolderPickerZone({ label, count, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        {count > 0 ? `${count} arquivo(s) de imagem encontrados` : "Nenhuma pasta selecionada"}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Selecionar pasta
      </button>
      <input
        ref={(el) => {
          inputRef.current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "true");
            el.setAttribute("directory", "true");
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
