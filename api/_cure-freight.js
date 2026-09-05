const CURE_FREIGHT_URL = "https://curepharmaceuticalspy.com/frete";
const STATES = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const MODES = ["sedex", "pac", "transportadora"];

// Read only the data literals; never execute JavaScript from the source site.
function extractFreightFromScript(script) {
  const rows = [...script.matchAll(/\{uf:"([A-Z]{2})",name:"(?:\\.|[^"\\])*",aliases:\[(?:\\.|[^\]])*\],values:\{([^{}]*)\}\}/g)];
  if (rows.length !== STATES.length) throw new Error("Tabela de fretes CURE incompleta.");
  const seen = new Set();
  const freight = rows.map(([, uf, literal]) => {
    if (!STATES.includes(uf) || seen.has(uf)) throw new Error("UF inválida ou duplicada nos fretes CURE.");
    seen.add(uf);
    const values = Object.fromEntries(MODES.map((mode) => [mode, null]));
    const fields = new Set();
    for (const entry of literal.split(",")) {
      const match = entry.trim().match(/^(sedex|pac|transportadora):((?:\d+(?:\.\d+)?|\.\d+)|null)$/);
      if (!match || fields.has(match[1])) throw new Error("Valor de frete CURE inválido.");
      fields.add(match[1]);
      values[match[1]] = match[2] === "null" ? null : Number(match[2]);
      if (values[match[1]] !== null && !Number.isFinite(values[match[1]])) throw new Error("Valor de frete CURE inválido.");
    }
    return { uf, values };
  });
  return freight.sort((left, right) => left.uf.localeCompare(right.uf));
}

async function fetchCureFreight({ fetchImpl = fetch, signal } = {}) {
  async function read(url) {
    const response = await fetchImpl(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Fretes CURE responderam HTTP ${response.status}.`);
    return response.text();
  }
  const html = await read(CURE_FREIGHT_URL);
  const paths = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1].replace(/&amp;/g, "&"))
    .filter((src) => /\/frete\/page-[^/]+\.js(?:\?.*)?$/.test(src));
  for (const src of new Set(paths)) {
    const url = new URL(src, CURE_FREIGHT_URL);
    if (url.origin !== new URL(CURE_FREIGHT_URL).origin) continue;
    return extractFreightFromScript(await read(url.href));
  }
  throw new Error("Dados de frete não encontrados na página CURE.");
}

module.exports = { CURE_FREIGHT_URL, extractFreightFromScript, fetchCureFreight };
