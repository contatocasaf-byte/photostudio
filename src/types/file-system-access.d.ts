// Tipos mínimos da File System Access API — ainda não incluída no
// lib.dom.d.ts do TypeScript (dez/2026). Só o que o projeto usa: abrir
// um seletor de pasta e listar/ler arquivos de forma preguiçosa (sem
// precisar materializar todos de uma vez, ao contrário de
// <input webkitdirectory>, que força o navegador a enumerar a árvore
// inteira antes de devolver qualquer coisa).
interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface Window {
  showDirectoryPicker?(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
