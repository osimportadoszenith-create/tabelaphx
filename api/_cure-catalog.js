const crypto = require("node:crypto");

const CURE_CATALOG_URL = "https://curepharmaceuticalspy.com/";
const MIN_EXPECTED_PRODUCTS = 100;
const AVAILABILITY_SYNC_ENABLED = false;
let cachedCatalog = null;
let cacheExpiresAt = 0;
let inFlightRequest = null;

function extractBalancedArray(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("A lista de produtos do catálogo CURE está incompleta.");
}

function extractFlightPayload(html) {
  const payloads = [];
  const pattern = /self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (typeof parsed[1] === "string") payloads.push(parsed[1]);
    } catch {
      // Other Next.js stream records do not contain catalog data.
    }
  }

  if (payloads.length === 0) {
    throw new Error("O catálogo CURE não contém o fluxo de dados esperado.");
  }

  return payloads.join("");
}

function extractProductsFromHtml(html) {
  if (typeof html !== "string" || html.length === 0) {
    throw new Error("O catálogo CURE retornou uma página vazia.");
  }

  const flightPayload = extractFlightPayload(html);
  const marker = '"products":[';
  const markerIndex = flightPayload.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error("A lista de produtos não foi encontrada no catálogo CURE.");
  }

  const arrayStart = flightPayload.indexOf("[", markerIndex + marker.length - 1);
  const products = JSON.parse(extractBalancedArray(flightPayload, arrayStart));

  if (!Array.isArray(products) || products.length < MIN_EXPECTED_PRODUCTS) {
    throw new Error(
      `Quantidade implausível de produtos no catálogo CURE: ${products.length}.`,
    );
  }

  const seenIds = new Set();
  for (const product of products) {
    if (
      !product ||
      typeof product.id !== "string" ||
      typeof product.brand !== "string" ||
      typeof product.name !== "string" ||
      typeof product.group !== "string" ||
      !Number.isFinite(Number(product.finalPrice))
    ) {
      throw new Error("O catálogo CURE retornou um produto com dados inválidos.");
    }
    if (seenIds.has(product.id)) {
      throw new Error(`ID de produto duplicado no catálogo CURE: ${product.id}.`);
    }
    seenIds.add(product.id);
  }

  return products;
}

function normalizeProduct(product) {
  const optionalString = (value) => {
    const normalized = String(value ?? "").trim();
    return normalized === "$undefined" ? "" : normalized;
  };

  return {
    id: product.id,
    category: String(product.category || "").trim(),
    group: String(product.group || "").trim(),
    brand: String(product.brand || "").trim(),
    displayBrand: optionalString(product.displayBrand) || String(product.brand).trim(),
    name: String(product.name || "").trim(),
    presentation: optionalString(product.presentation),
    descriptionText: optionalString(product.descriptionText),
    finalPrice: Number(product.finalPrice),
    status: String(product.status || "inactive").trim().toLowerCase(),
    sortOrder: Number.isFinite(Number(product.sortOrder))
      ? Number(product.sortOrder)
      : Number.MAX_SAFE_INTEGER,
    isDeleted: Boolean(product.isDeleted),
  };
}

function catalogVersion(products) {
  const relevantData = products.map((product) => {
    const fields = [
      product.id,
      product.category,
      product.group,
      product.presentation,
      product.descriptionText,
      product.finalPrice,
      product.isDeleted,
    ];

    if (AVAILABILITY_SYNC_ENABLED) fields.push(product.status);
    return fields;
  });

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(relevantData))
    .digest("hex")
    .slice(0, 16);
}

async function fetchCureCatalog(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const url = options.url || CURE_CATALOG_URL;
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "PHENIX-Catalog-Sync/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Catálogo CURE respondeu HTTP ${response.status}.`);
    }

    const products = extractProductsFromHtml(await response.text()).map(
      normalizeProduct,
    );

    return {
      source: url,
      fetchedAt: new Date().toISOString(),
      version: catalogVersion(products),
      products,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getCureCatalog(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 15000;
  const allowStale = options.allowStale ?? true;
  const now = Date.now();

  if (cachedCatalog && now < cacheExpiresAt) return cachedCatalog;
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = fetchCureCatalog(options)
    .then((catalog) => {
      cachedCatalog = { ...catalog, stale: false };
      cacheExpiresAt = Date.now() + maxAgeMs;
      return cachedCatalog;
    })
    .catch((error) => {
      if (allowStale && cachedCatalog) {
        return { ...cachedCatalog, stale: true, refreshError: error.message };
      }
      throw error;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

module.exports = {
  AVAILABILITY_SYNC_ENABLED,
  CURE_CATALOG_URL,
  catalogVersion,
  extractProductsFromHtml,
  fetchCureCatalog,
  getCureCatalog,
  normalizeProduct,
};
