const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const catalogSyncHandler = require("../api/catalog-sync");
const {
  AVAILABILITY_SYNC_ENABLED,
  catalogVersion,
  fetchCureCatalog,
} = require("../api/_cure-catalog");
const {
  CATEGORY_CONFIG,
  applyCureCatalogToHtml,
} = require("../api/_catalog-renderer");

function detailsBlock(html, id) {
  const start = html.indexOf(`<details class="category" id="${id}">`);
  const end = html.indexOf("</details>", start);
  assert.notEqual(start, -1, `Categoria ${id} ausente.`);
  assert.notEqual(end, -1, `Categoria ${id} incompleta.`);
  return html.slice(start, end + "</details>".length);
}

function captureResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

async function main() {
  const pagePath = path.join(process.cwd(), "TABELAPHX.html");
  const originalHtml = fs.readFileSync(pagePath, "utf8");
  const catalog = await fetchCureCatalog();
  const renderedHtml = applyCureCatalogToHtml(originalHtml, catalog);
  const sourceProducts = catalog.products.filter((product) => !product.isDeleted);
  const renderedIds = [
    ...renderedHtml.matchAll(/data-cure-id="([^"]+)"/g),
  ].map((match) => match[1]);

  assert.equal(
    new Set(renderedIds).size,
    renderedIds.length,
    "Há IDs CURE duplicados no HTML renderizado.",
  );
  assert.equal(
    renderedIds.length,
    sourceProducts.length,
    "Nem todos os produtos CURE foram renderizados.",
  );
  assert.equal(
    detailsBlock(renderedHtml, "phenix"),
    detailsBlock(originalHtml, "phenix"),
    "A categoria PHENIX LABS foi alterada.",
  );
  const endpointResponse = captureResponse();
  await catalogSyncHandler(
    { query: { token: process.env.PRIVATE_ACCESS_TOKEN || "py" } },
    endpointResponse,
  );
  assert.equal(endpointResponse.statusCode, 200);
  assert.equal(endpointResponse.body.availabilitySync, false);
  assert.equal("unavailable" in endpointResponse.body, false);
  assert.deepEqual(endpointResponse.body.syncedFields, [
    "finalPrice",
    "presentation",
    "descriptionText",
    "category",
    "group",
  ]);

  const selectedProduct = sourceProducts.find(
    (product) =>
      product.id === "emagrecedores-zphcd-retatrutida-caneta-30-mg-item",
  );
  assert(selectedProduct, "Produto sentinela da ZPHCD não encontrado.");
  assert.equal(selectedProduct.finalPrice, 2800);
  assert.match(
    renderedHtml,
    /data-cure-id="emagrecedores-zphcd-retatrutida-caneta-30-mg-item"[\s\S]{0,500}?R\$\s*2\.800,00/,
    "O preço final do produto sentinela não foi aplicado.",
  );

  const simulatedCatalog = {
    ...catalog,
    version: "simulated-change",
    products: catalog.products.map((product) =>
      product.id === selectedProduct.id
        ? {
            ...product,
            category: "MARCAS PREMIUM",
            group: "INJETÁVEIS",
            presentation: "APRESENTAÇÃO SINCRONIZADA",
            descriptionText: "DESCRIÇÃO SINCRONIZADA",
            finalPrice: 2999,
            status: "inactive",
          }
        : product,
    ),
  };
  const simulatedHtml = applyCureCatalogToHtml(originalHtml, simulatedCatalog);
  const simulatedPremium = detailsBlock(simulatedHtml, "premium");
  const simulatedEmagrecedores = detailsBlock(simulatedHtml, "emagrecedores");

  assert.doesNotMatch(
    simulatedEmagrecedores,
    new RegExp(`data-cure-id="${selectedProduct.id}"`),
    "A mudança simulada de categoria não removeu o produto da categoria anterior.",
  );
  assert.match(
    simulatedPremium,
    new RegExp(
      `class="product-row" data-cure-id="${selectedProduct.id}"[\\s\\S]{0,600}?APRESENTAÇÃO SINCRONIZADA[\\s\\S]{0,300}?DESCRIÇÃO SINCRONIZADA[\\s\\S]{0,300}?R\\$\\s*2\\.999,00`,
    ),
    "Preço, descrição ou categoria simulados não foram refletidos.",
  );
  assert.doesNotMatch(
    simulatedPremium,
    /is-unavailable|data-cure-status|INDISPONÍVEL/,
    "A disponibilidade foi renderizada mesmo estando desativada.",
  );
  const statusOnlyProducts = catalog.products.map((product) =>
    product.id === selectedProduct.id
      ? {
          ...product,
          status: product.status === "active" ? "out_of_stock" : "active",
        }
      : product,
  );
  assert.equal(
    catalogVersion(catalog.products),
    catalogVersion(statusOnlyProducts),
    "Uma mudança apenas de status alterou a versão sincronizada.",
  );
  assert.equal(
    detailsBlock(simulatedHtml, "phenix"),
    detailsBlock(originalHtml, "phenix"),
    "A simulação alterou a categoria PHENIX LABS.",
  );

  const categories = Object.fromEntries(
    CATEGORY_CONFIG.map((config) => {
      const block = detailsBlock(renderedHtml, config.id);
      return [
        config.id,
        {
          products: (block.match(/data-cure-id=/g) || []).length,
          brands: (block.match(/data-cure-brand=/g) || []).length,
        },
      ];
    }),
  );

  console.log(
    JSON.stringify(
      {
        source: catalog.source,
        version: catalog.version,
        fetchedAt: catalog.fetchedAt,
        products: sourceProducts.length,
        availabilitySync: AVAILABILITY_SYNC_ENABLED,
        categories,
        phenixLabsProtected: true,
        sentinel: {
          id: selectedProduct.id,
          finalPrice: selectedProduct.finalPrice,
        },
        simulatedChanges: {
          price: true,
          category: true,
          description: true,
          availabilityDisabled: true,
          phenixLabsProtected: true,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
