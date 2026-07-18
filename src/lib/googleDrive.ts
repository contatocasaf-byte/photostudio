import "server-only";
import { google } from "googleapis";

// Galeria de fotos do Criador de Catálogos (Fase 5, Parte 7) —
// reaproveita a MESMA service account já configurada pro Cadência CRM
// (acesso do Drive é concedido por pasta compartilhada, não por
// projeto, então a mesma credencial serve pros dois apps sem
// conflito). `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` precisa ter o mesmo
// valor já usado lá. Nunca importar deste módulo em código que roda
// no navegador — "server-only" quebra o build se isso acontecer.
function loadServiceAccount(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_JSON não configurada.");
  return JSON.parse(raw);
}

export function createDriveClient() {
  const key = loadServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: key.client_email, private_key: key.private_key },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

// Exibido na tela de configuração da galeria — o usuário precisa
// compartilhar a pasta do Drive com esse e-mail pra dar acesso à
// service account, sem precisar abrir o JSON pra descobrir.
export function getServiceAccountEmail(): string {
  return loadServiceAccount().client_email;
}
