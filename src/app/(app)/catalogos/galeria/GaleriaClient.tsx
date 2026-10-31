"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  diagnosticarCodigoGaleria,
  getGaleriaConfig,
  saveGaleriaConfig,
  testGaleriaConnection,
  type DiagnosticoGaleria,
} from "./actions";
import { getGaleriaCacheStatus, garantirFotosNoCache, listarPendentesCache, type CacheStatus } from "./cacheActions";

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

  // Cache das fotos no R2 (ver src/lib/galeriaCacheCore.ts).
  const [cache, setCache] = useState<CacheStatus | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [sincMsg, setSincMsg] = useState<string | null>(null);
  const cancelarSinc = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getGaleriaCacheStatus().then((res) => {
      if (!cancelled) setCache(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSincronizar() {
    setSincronizando(true);
    setSincMsg("Verificando quais fotos faltam...");
    cancelarSinc.current = false;
    try {
      const lista = await listarPendentesCache();
      if (lista.error || !lista.pendentes) {
        setSincMsg(`⚠ ${lista.error ?? "Falha ao verificar o cache."}`);
        return;
      }
      const pendentes = lista.pendentes;
      if (pendentes.length === 0) {
        setSincMsg("✔ Todas as fotos já estão no cache.");
        return;
      }
      let feitas = 0;
      let falhas = 0;
      for (let i = 0; i < pendentes.length; i += 10) {
        if (cancelarSinc.current) {
          setSincMsg(`Interrompido — ${feitas} de ${pendentes.length} copiadas (as demais ficam para a próxima vez).`);
          return;
        }
        const lote = pendentes.slice(i, i + 10);
        const res = await garantirFotosNoCache(lote);
        if (res.error || !res.resultados) falhas += lote.length;
        else falhas += res.resultados.filter((r) => !r.ok).length;
        feitas += lote.length;
        setSincMsg(`Copiando fotos ${feitas}/${pendentes.length}...`);
      }
      setSincMsg(falhas > 0 ? `⚠ Concluído, mas ${falhas} foto(s) falharam — clique em Sincronizar de novo para tentar outra vez.` : `✔ ${pendentes.length} foto(s) copiadas.`);
    } catch (e) {
      setSincMsg(`⚠ ${e instanceof Error ? e.message : "Falha ao sincronizar."}`);
    } finally {
      setSincronizando(false);
      getGaleriaCacheStatus().then(setCache);
    }
  }

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
                  <b>{diag.subpastas}</b> subpasta(s) (não são lidas), <b>{diag.atalhos}</b> atalho(s).
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
                          {f.naPasta ? "na pasta" : <span className="text-amber-700">FORA da pasta configurada (subpasta ou outra pasta)</span>} —{" "}
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

          <div className="mt-8 rounded-md border border-slate-200 px-3 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Cache das fotos (rápido e protegido)</h2>
            <p className="mt-1 text-xs text-slate-500">
              As fotos são copiadas uma vez do Drive para um armazenamento privado e carregadas de lá — mais rápido, sem passar pelo servidor do site, e
              só quem está logado recebe acesso. Quando uma foto é substituída no Drive (mesmo mantendo o nome), a cópia nova é feita sozinha. Cada
              foto fica guardada em qualidade total (usada no PDF) e numa versão leve (usada só na visualização do catálogo, para abrir mais rápido).
            </p>
            {cache === null ? (
              <p className="mt-2 text-xs text-slate-400">Verificando...</p>
            ) : !cache.ativo ? (
              <p className="mt-2 text-xs text-amber-700">
                {cache.error ?? "Desligado: falta configurar o armazenamento privado (variável R2_GALERIA_BUCKET_NAME). Enquanto isso, o sistema serve as fotos do jeito de antes."}
              </p>
            ) : cache.error ? (
              <p className="mt-2 text-xs text-red-600">{cache.error}</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-700">
                  <b>{cache.emCache}</b> de <b>{cache.total}</b> fotos prontas no cache
                  {cache.semVersao ? ` · ${cache.semVersao} sem informação de versão (usam o caminho antigo)` : ""}
                </p>
                <button
                  onClick={handleSincronizar}
                  disabled={sincronizando}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {sincronizando ? "Sincronizando..." : "Sincronizar fotos"}
                </button>
                {sincronizando && (
                  <button onClick={() => (cancelarSinc.current = true)} className="text-xs text-slate-400 hover:text-slate-700">
                    Parar
                  </button>
                )}
              </div>
            )}
            {sincMsg && <p className="mt-2 text-xs text-slate-600">{sincMsg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
