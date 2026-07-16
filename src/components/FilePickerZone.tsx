"use client";

import { useRef, useState } from "react";

type Props = {
  multiple?: boolean;
  disabled?: boolean;
  title: string;
  subtitle: string;
  buttonLabel: string;
  onFiles: (files: FileList) => void;
};

// Área de upload clicável (não só o <input type="file"> nu, que não dá
// nenhuma pista visual de que é clicável) — clique em qualquer parte do
// quadro ou no botão abrem o seletor de arquivo; também aceita arrastar e
// soltar. Botão com a MESMA aparência do "Remover fundo de todas".
export default function FilePickerZone({ multiple, disabled, title, subtitle, buttonLabel, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={
        "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors " +
        (disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
          : dragOver
            ? "cursor-pointer border-slate-500 bg-slate-50"
            : "cursor-pointer border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50")
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-8 w-8 text-slate-400"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0 4 4m-4-4-4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>

      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          openPicker();
        }}
        className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {buttonLabel}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          // Permite selecionar o mesmo arquivo de novo em seguida (senão
          // onChange não dispara na segunda vez com o mesmo nome).
          e.target.value = "";
        }}
      />
    </div>
  );
}
