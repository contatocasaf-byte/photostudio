// Cantos arredondados das formas decorativas do card (retângulo e triângulo).
// A MESMA geometria é usada no editor, na visualização e no PDF (o backend
// em Python tem a mesma conta em pdf_logic.py — se mudar aqui, mude lá).
//
// `raio` é o raio do arredondamento, no mesmo espaço de desenho da forma.
// Retângulo: arco circular de verdade (Konva `cornerRadius`; reportlab
// `roundRect`), com o raio limitado à metade do menor lado. Triângulo: em
// cada vértice, uma curva quadrática com a ponta no vértice e as
// extremidades a uma distância `d = raio / tan(ângulo/2)` (a mesma de um arco
// circular de raio `raio`), limitada à metade do lado vizinho.

export function raioEfetivoRetangulo(w: number, h: number, raio: number | undefined): number {
  if (!raio || raio <= 0) return 0;
  return Math.max(0, Math.min(raio, w / 2, h / 2));
}

export type ComandoCaminho = { t: "M" | "L" | "Q" | "Z"; p: number[] };

export function caminhoTriangulo(w: number, h: number, raio: number | undefined): ComandoCaminho[] {
  // Mesmos vértices de antes: topo-centro, base-direita, base-esquerda.
  const v: [number, number][] = [
    [w / 2, 0],
    [w, h],
    [0, h],
  ];
  if (!raio || raio <= 0) {
    return [{ t: "M", p: v[0] }, { t: "L", p: v[1] }, { t: "L", p: v[2] }, { t: "Z", p: [] }];
  }

  const cantos = v.map((c, i) => {
    const ant = v[(i + 2) % 3];
    const prox = v[(i + 1) % 3];
    const la = Math.hypot(ant[0] - c[0], ant[1] - c[1]);
    const lp = Math.hypot(prox[0] - c[0], prox[1] - c[1]);
    const u1: [number, number] = la > 0 ? [(ant[0] - c[0]) / la, (ant[1] - c[1]) / la] : [0, 0];
    const u2: [number, number] = lp > 0 ? [(prox[0] - c[0]) / lp, (prox[1] - c[1]) / lp] : [0, 0];
    const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const meio = Math.acos(cos) / 2; // metade do ângulo interno do vértice
    const d = Math.min(meio > 1e-6 ? raio / Math.tan(meio) : 0, la / 2, lp / 2);
    return {
      c,
      a: [c[0] + u1[0] * d, c[1] + u1[1] * d] as [number, number], // sobre a aresta que vem do vértice anterior
      b: [c[0] + u2[0] * d, c[1] + u2[1] * d] as [number, number], // sobre a aresta que vai pro próximo
    };
  });

  const cmds: ComandoCaminho[] = [{ t: "M", p: cantos[0].a }];
  cantos.forEach((k, i) => {
    if (i > 0) cmds.push({ t: "L", p: k.a });
    cmds.push({ t: "Q", p: [k.c[0], k.c[1], k.b[0], k.b[1]] });
  });
  cmds.push({ t: "Z", p: [] });
  return cmds;
}

type ContextoDeCaminho = {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
};

export function tracarTriangulo(ctx: ContextoDeCaminho, w: number, h: number, raio: number | undefined): void {
  for (const cmd of caminhoTriangulo(w, h, raio)) {
    if (cmd.t === "M") ctx.moveTo(cmd.p[0], cmd.p[1]);
    else if (cmd.t === "L") ctx.lineTo(cmd.p[0], cmd.p[1]);
    else if (cmd.t === "Q") ctx.quadraticCurveTo(cmd.p[0], cmd.p[1], cmd.p[2], cmd.p[3]);
    else ctx.closePath();
  }
}
