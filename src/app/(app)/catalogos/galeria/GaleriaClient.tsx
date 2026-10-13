"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  diagnosticarCodigoGaleria,
  getGaleriaConfig,
  saveGaleriaConfig,
  testGaleriaConnection,
  type DiagnosticoGaleria,
} from "./actions";

export default function GaleriaFotosPage() {
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [savedFolderId, setSavedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagCodigo, setDiagCodigo] = useState("");
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagnosticoGaleria | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGaleriaConfig().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else {
        setServiceAccountEmail(res.serviceAccountEmail ?? null);
        setSavedFolderId(res.folderId ?? null);
        if (res.folderId) setFolderInput(res.folderId);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTest() {
    if (!folderInput.trim()) return;
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await testGaleriaConnection(folderInput);
      if (res.error) setError(res.error);
      else setTestResult(`✔ Conexão OK — ${res.count} foto(s) encontrada(s) na pasta.`);
    } finally {
      setTesting(false);
    }
  }

  async function handleDiagnosticar() {
    if (!diagCodigo.trim()) return;
    setDiagLoading(true);
    setDiagError(null);
    setDiag(null);
    try {
      const res = await diagnosticarCodigoGaleria(diagCodigo);
      if (res.error) setDiagError(res.error);
      else setDiag(res.diagnostico ?? null);
    } finally {
      setDiagLoading(false);
    }
  }

  async function handleSave() {
    if (!folderInput.trim()) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await saveGaleriaConfig(folderInput);
      if (res.error) setError(res.error);
      else {
        setStatus("✔ Pasta salva.");
        setSavedFolderId(folderInput.trim());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link href="/catalogos" className="text-xs text-slate-500 hover:text-slate-700">
        ← Criador de Catálogos
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Galeria de Fotos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Aponte pra uma pasta do Google Drive com as fotos de produto, nomeadas <code className="rounded bg-slate-100 px-1 py-0.5">CODIGO_1.jpg</code>{" "}
        (ou <code className="rounded bg-slate-100 px-1 py-0.5">CODIGO.jpg</code>). Os cards do catálogo casam a foto pelo código do produto
        automaticamente — pra repor ou adicionar uma foto, basta soltar o arquivo na pasta do Drive, sem nenhum passo extra aqui.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Carregando...</p>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">
              Compartilhe a pasta do Drive (só leitura já basta) com este e-mail:
            </p>
            <code className="mt-1 block break-all text-sm text-slate-800">{serviceAccountEmail ?? "—"}</code>
          </div>

          <div className="mt-4">
            <label className="text-xs text-slate-500">Link ou ID da pasta do Drive</label>
            <input
              value={folderInput}
              onChange={(e) => {
                setFolderInput(e.target.value);
                setTestResult(null);
              }}
              placeholder="https://drive.google.com/drive/folders/..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {savedFolderId && (
              <p className="mt-1 text-[11px] text-slate-400">Pasta salva atualmente: {savedFolderId}</p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || !folderInput.trim()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? "Testando..." : "Testar conexão"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !folderInput.trim()}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {testResult && <p className="mt-3 text-sm text-emerald-700">{testResult}</p>}
          {status && <p className="mt-3 text-sm text-slate-500">{status}</p>}

          <div className="mt-8 rounded-md border border-slate-200 px-3 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Diagnosticar um código</h2>
            <p className="mt-1 text-xs text-slate-500">
              A foto de um produto não aparece no catálogo? Digite o código e veja o que existe no Drive pra ele.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={diagCodigo}
                onChange={(e) => setDiagCodigo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDiagnosticar()}
                placeholder="Ex.: 15919"
                className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={handleDiagnosticar}
                disabled={diagLoading || !diagCodigo.trim()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {diagLoading ? "Consultando..." : "Diagnosticar"}
              </button>
            </div>
            {diagError && <p className="mt-2 text-sm text-red-600">{diagError}</p>}
            {diag && (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>
                  Pasta: <b>{diag.totalNaPasta}</b> item(ns) no total, <b>{diag.imagensReconhecidas}</b> reconhecido(s) como imagem (JPEG/PNG/WebP),{" "}
                  <b>{diag.subpastas}</b> subpasta(s) (também são lidas), <b>{diag.atalhos}</b> atalho(s).
                </p>
                {diag.outrosTipos.length > 0 && (
                  <p className="text-slate-500">
                    Outros tipos na pasta (ignorados): {diag.outrosTipos.map((t) => `${t.mimeType || "sem tipo"} × ${t.count}`).join(", ")}
                  </p>
                )}
                <div>
                  <p className="font-medium">Arquivos com &quot;{diagCodigo.trim()}&quot; no nome:</p>
                  {diag.arquivosComCodigo.length === 0 ? (
                    <p className="text-red-600">Nenhum — o Drive (visto pela conta de serviço) não tem arquivo com esse código.</p>
                  ) : (
                    <ul className="mt-1 list-disc pl-5">
                      {diag.arquivosComCodigo.map((f, i) => (
                        <li key={i}>
                          <code>{f.name}</code> — {f.mimeType || "sem tipo"} —{" "}
                          {f.naPasta ? "na pasta principal" : <span className="text-amber-700">fora da pasta principal (subpasta ou outra pasta)</span>} —{" "}
                          {f.reconhecido ? "tipo reconhecido" : <span className="text-amber-700">tipo NÃO reconhecido (ignorado)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p>
                  Foto que o app usa agora (cache de até 90s): <b>{diag.resultadoApp ?? "nenhuma"}</b>
                  <br />
                  Foto que o Drive tem ao vivo: <b>{diag.resultadoAoVivo ?? "nenhuma"}</b>
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
