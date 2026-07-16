// Porta de fast_flood_fill_mask (removedor_fundo.py:134-176) — varinha
// mágica. BFS 4-conectado sobre os pixels RGB da imagem ORIGINAL (não da
// tela exibida): um pixel entra na seleção se a distância euclidiana ao
// quadrado da sua cor até a cor do pixel-semente for <= tolerância² × 3
// (mesmo critério do original, "fator 3" = soma dos 3 canais R+G+B).
export function floodFillMask(imageData: ImageData, seedX: number, seedY: number, tolerance: number): Uint8Array {
  const { width: w, height: h, data } = imageData;
  const sx = Math.max(0, Math.min(w - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seedY)));

  const seedI = (sy * w + sx) * 4;
  const sr = data[seedI];
  const sg = data[seedI + 1];
  const sb = data[seedI + 2];
  const tol2 = tolerance * tolerance * 3;

  const mask = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  qx[tail] = sx;
  qy[tail] = sy;
  tail++;
  visited[sy * w + sx] = 1;

  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;

    const i = (y * w + x) * 4;
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    if (dr * dr + dg * dg + db * db > tol2) continue;

    mask[y * w + x] = 255;

    if (x > 0) {
      const ni = y * w + (x - 1);
      if (!visited[ni]) {
        visited[ni] = 1;
        qx[tail] = x - 1;
        qy[tail] = y;
        tail++;
      }
    }
    if (x < w - 1) {
      const ni = y * w + (x + 1);
      if (!visited[ni]) {
        visited[ni] = 1;
        qx[tail] = x + 1;
        qy[tail] = y;
        tail++;
      }
    }
    if (y > 0) {
      const ni = (y - 1) * w + x;
      if (!visited[ni]) {
        visited[ni] = 1;
        qx[tail] = x;
        qy[tail] = y - 1;
        tail++;
      }
    }
    if (y < h - 1) {
      const ni = (y + 1) * w + x;
      if (!visited[ni]) {
        visited[ni] = 1;
        qx[tail] = x;
        qy[tail] = y + 1;
        tail++;
      }
    }
  }

  return mask;
}
