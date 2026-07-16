"use client";

import { useRef } from "react";

// Um item da pasta com leitura preguiçosa: o navegador só lê os bytes
// do arquivo quando `getFile()` é chamado — nunca antes. Selecionar a
// pasta só lista nomes, não "sobe" nada.
export type LazyFileEntry = { name: string; getFile: () => Promise<File> };

type Props = {
  label: string;
  count: number;
  extensions: string[]; // ex: [".jpg", ".png"] — case-insensitive
  onEntries: (entries: LazyFileEntry[]) => void;
};

function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

// Seleciona uma pasta e lista só os NOMES dos arquivos diretamente
// dentro dela (sem descer em subpastas, sem ler conteúdo nenhum).
//
// Caminho rápido: File System Access API (`showDirectoryPicker`,
// Chrome/Edge) — `dirHandle.entries()` é um iterador assíncrono que
// devolve só metadados; ler o arquivo de fato só acontece depois, um
// a um, via `entry.getFile()` — só pros que o chamador realmente
// precisar (ex: só os "pendentes" no Comparador de Pastas), não pra
// pasta inteira. Evita materializar milhares de arquivos em alta
// resolução só pra listar nomes.
//
// Fallback (Firefox/Safari, sem suporte à API acima): <input
// webkitdirectory>, que enumera a árvore inteira de uma vez (mais
// pesado em pastas grandes, mas é o único jeito nesses navegadores).
export default function FolderPickerZone({ label, count, extensions, onEntries }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));

  async function pickViaFileSystemAccess() {
    if (!window.showDirectoryPicker) return;
    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "read" });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // usuário cancelou
      throw err;
    }

    const entries: LazyFileEntry[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== "file") continue; // sem recursão em subpastas
      if (!extSet.has(extOf(name))) continue;
      const fileHandle = handle as FileSystemFileHandle;
      entries.push({ name, getFile: () => fileHandle.getFile() });
    }
    onEntries(entries);
  }

  function handleClick() {
    if (typeof window !== "undefined" && window.showDirectoryPicker) {
      pickViaFileSystemAccess();
    } else {
      inputRef.current?.click();
    }
  }

  function handleLegacyChange(fileList: FileList) {
    const entries: LazyFileEntry[] = Array.from(fileList)
      .filter((f) => {
        const rel = f.webkitRelativePath;
        if (rel && rel.split("/").length !== 2) return false; // só direto na pasta, sem subpastas
        return extSet.has(extOf(f.name));
      })
      .map((f) => ({ name: f.name, getFile: () => Promise.resolve(f) }));
    onEntries(entries);
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        {count > 0 ? `${count} arquivo(s) de imagem encontrados` : "Nenhuma pasta selecionada"}
      </p>
      <button
        onClick={handleClick}
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
          if (e.target.files?.length) handleLegacyChange(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
