const { AVAILABILITY_SYNC_ENABLED } = require("./_cure-catalog");

const CATEGORY_CONFIG = [
  {
    id: "premium",
    label: "PREMIUM",
    sourceCategories: ["MARCAS PREMIUM", "PREMIUM"],
  },
  {
    id: "importadas",
    label: "IMPORTADAS",
    sourceCategories: ["MARCAS IMPORTADAS", "IMPORTADAS"],
  },
  {
    id: "emagrecedores",
    label: "EMAGRECEDORES",
    sourceCategories: ["CANETAS EMAGRECEDORAS", "EMAGRECEDORES"],
  },
  {
    id: "peptidios",
    label: "PEPTÍDEOS",
    sourceCategories: ["PEPTÍDEOS", "PEPTIDEOS"],
  },
  {
    id: "farmacia",
    label: "FARMÁCIA",
    sourceCategories: ["FARMÁCIA", "FARMACIA"],
  },
];

const DISPLAY_BRAND_OVERRIDES = new Map([
  ["farmacia|GH", "GH"],
]);

const SYNC_STYLE = `
<style id="cure-catalog-sync-styles">
  .product-info .cure-visual-brand{display:block;margin-top:4px;color:#ff6b72;font-size:10px;line-height:1.3;letter-spacing:.08em;text-transform:uppercase}
  .product-info .cure-description{display:block;margin-top:4px;color:#a9a1a1;font-size:10px;line-height:1.45;letter-spacing:.03em;white-space:pre-line}
  .catalog-sync-warning{margin:10px 0;padding:9px 12px;border:1px solid rgba(224,26,34,.45);color:#ff8a8f;font-size:11px;text-align:center}
  .brand-feature .cure-brand-logo{display:block;width:100%;height:108px;object-fit:contain}
</style>`;

const SYNC_SCRIPT = `
<script id="cure-catalog-sync-poller">
(function(){
  var currentVersion=document.documentElement.getAttribute('data-cure-catalog-version')||'';
  var endpoint='/py/catalog.json';
  async function checkForUpdates(){
    try{
      var response=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok) return;
      var data=await response.json();
      if(data&&data.version&&currentVersion&&data.version!==currentVersion){
        window.location.reload();
      }
    }catch(error){
      console.warn('Sincronização do catálogo temporariamente indisponível.');
    }
  }
  window.setInterval(checkForUpdates,30000);
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden) checkForUpdates();
  });
})();
</script>`;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function slug(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function findDetailsBlock(html, categoryId) {
  const opening = `<details class="category" id="${categoryId}">`;
  const start = html.indexOf(opening);
  if (start === -1) {
    throw new Error(`Categoria local não encontrada: ${categoryId}.`);
  }

  const endMarker = "</details>";
  const end = html.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Categoria local incompleta: ${categoryId}.`);
  }

  return {
    start,
    end: end + endMarker.length,
    block: html.slice(start, end + endMarker.length),
  };
}

function extractLogoClasses(html) {
  const logoClasses = new Map();

  for (const config of CATEGORY_CONFIG) {
    const { block } = findDetailsBlock(html, config.id);
    const sectionPattern = /<section class="brand-card"[^>]*>([\s\S]*?)<\/section>/g;
    let sectionMatch;

    while ((sectionMatch = sectionPattern.exec(block)) !== null) {
      const section = sectionMatch[1];
      const brandMatch = section.match(
        /<span class="brand-kicker-name">\s*\d+\s+PRODUTOS?\s*-\s*([^<]+)<\/span>/i,
      );
      const logoMatch = section.match(/<div class="brand-feature\s+([^"\s]+)"/i);

      if (brandMatch && logoMatch) {
        logoClasses.set(
          `${config.id}|${normalize(brandMatch[1])}`,
          logoMatch[1],
        );
      }
    }
  }

  return logoClasses;
}

function renderProduct(product) {
  const unavailable =
    AVAILABILITY_SYNC_ENABLED && product.status !== "active";
  const presentation = product.presentation
    ? `<span class="sub">${escapeHtml(product.presentation)}</span>`
    : "";
  const visualBrand =
    normalize(product.brand) === "GH" && product.displayBrand
      ? `<span class="cure-visual-brand">Marca: ${escapeHtml(product.displayBrand)}</span>`
      : "";
  const description = product.descriptionText
    ? `<span class="cure-description">${escapeHtml(product.descriptionText)}</span>`
    : "";
  const price = `<span class="price">${escapeHtml(formatPrice(product.finalPrice))}</span>`;
  const priceColumn = unavailable
    ? `<span class="product-price-status">${price}<span class="availability-status">INDISPONÍVEL</span></span>`
    : price;

  const statusAttribute = AVAILABILITY_SYNC_ENABLED
    ? ` data-cure-status="${escapeHtml(product.status)}"`
    : "";

  return `            <li class="product-row${unavailable ? " is-unavailable" : ""}" data-cure-id="${escapeHtml(product.id)}"${statusAttribute}>
                <div class="product-info">
                  <span class="name">${escapeHtml(product.name)}</span>
                  ${presentation}
                  ${visualBrand}
                  ${description}
                </div>
                ${priceColumn}
              </li>`;
}

function renderBrandCard(config, brand, products, logoClasses, brandLogos) {
  const sourceDisplayBrand =
    products.find((product) => product.displayBrand)?.displayBrand || brand;
  const displayBrand =
    DISPLAY_BRAND_OVERRIDES.get(`${config.id}|${normalize(brand)}`) ||
    sourceDisplayBrand;
  const logoClass =
    logoClasses.get(`${config.id}|${normalize(brand)}`) || "logo-variados";
  const usePhxLogo = config.id === "emagrecedores" && normalize(brand) === "VARIADOS";
  const sourceLogo = config.id === "farmacia" || usePhxLogo ? null : brandLogos.get(normalize(brand));
  const logo = usePhxLogo
    ? '<img class="cure-brand-logo" src="/PAGINAS/PHX%20BLACK.svg" alt="PHX" loading="lazy" decoding="async">'
    : sourceLogo
    ? `<img class="cure-brand-logo" src="${escapeHtml(sourceLogo)}" alt="${escapeHtml(displayBrand)}" loading="lazy" decoding="async">`
    : `<span class="logo-img ${escapeHtml(logoClass)}" role="img" aria-label="${escapeHtml(displayBrand)}"></span>`;
  const productsByGroup = new Map();

  for (const product of products) {
    const group = product.group || config.label;
    if (!productsByGroup.has(group)) productsByGroup.set(group, []);
    productsByGroup.get(group).push(product);
  }

  const groupEntries = [...productsByGroup.entries()].sort((left, right) => {
    const leftOrder = Math.min(...left[1].map((product) => product.sortOrder));
    const rightOrder = Math.min(...right[1].map((product) => product.sortOrder));
    return leftOrder - rightOrder;
  });

  const rows = groupEntries
    .map(([group, groupProducts]) => {
      const sortedProducts = [...groupProducts].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );
      return [
        `            <li class="product-type-label"><span>${escapeHtml(group)}</span></li>`,
        ...sortedProducts.map(renderProduct),
      ].join("\n");
    })
    .join("\n");

  return `          <section class="brand-card" id="${config.id}-${slug(brand)}" data-cure-brand="${escapeHtml(brand)}">
          <div class="brand-kicker">
            <span class="brand-kicker-left">
              <span class="mini-seal" role="img" aria-label="CURE Pharmaceuticals"></span>
              <span>${escapeHtml(config.label)}</span>
            </span>
            <span class="brand-kicker-name">${products.length} ${products.length === 1 ? "PRODUTO" : "PRODUTOS"} - ${escapeHtml(displayBrand)}</span>
          </div>
          <div class="brand-feature ${escapeHtml(logoClass)}">
            ${logo}
          </div>
          <ul class="product-list">
${rows}
          </ul>
        </section>`;
}

function renderCategory(config, products, logoClasses, brandLogos) {
  const productsByBrand = new Map();

  for (const product of products) {
    if (!productsByBrand.has(product.brand)) productsByBrand.set(product.brand, []);
    productsByBrand.get(product.brand).push(product);
  }

  const brandEntries = [...productsByBrand.entries()].sort((left, right) => {
    const leftOrder = Math.min(...left[1].map((product) => product.sortOrder));
    const rightOrder = Math.min(...right[1].map((product) => product.sortOrder));
    return leftOrder - rightOrder;
  });

  return {
    brandCount: brandEntries.length,
    html: brandEntries
      .map(([brand, brandProducts]) =>
        renderBrandCard(config, brand, brandProducts, logoClasses, brandLogos),
      )
      .join("\n"),
  };
}

function replaceCategory(html, config, products, logoClasses, brandLogos) {
  const details = findDetailsBlock(html, config.id);
  const rendered = renderCategory(config, products, logoClasses, brandLogos);
  let block = details.block;

  block = block.replace(
    /(<span class="cat-title">[\s\S]*?<small>)[\s\S]*?(<\/small>)/,
    `$1${products.length} produtos &middot; ${rendered.brandCount} marcas$2`,
  );

  const bodyOpening = '<div class="category-body">';
  const bodyStart = block.indexOf(bodyOpening);
  const bodyEnd = block.lastIndexOf("</div>");

  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
    throw new Error(`Corpo da categoria local não encontrado: ${config.id}.`);
  }

  block = `${block.slice(0, bodyStart)}${bodyOpening}\n${rendered.html}\n        ${block.slice(bodyEnd)}`;
  return `${html.slice(0, details.start)}${block}${html.slice(details.end)}`;
}

function injectCatalogSyncAssets(html, version) {
  let renderedHtml = html.replace(
    /<html([^>]*)>/i,
    `<html$1 data-cure-catalog-version="${escapeHtml(version || "static")}">`,
  );

  if (!renderedHtml.includes('id="cure-catalog-sync-styles"')) {
    renderedHtml = renderedHtml.replace("</head>", `${SYNC_STYLE}\n</head>`);
  }
  if (!renderedHtml.includes('id="cure-catalog-sync-poller"')) {
    renderedHtml = renderedHtml.replace("</body>", `${SYNC_SCRIPT}\n</body>`);
  }

  return renderedHtml;
}

function applyCureCatalogToHtml(html, catalog) {
  if (!catalog || !Array.isArray(catalog.products) || !catalog.version) {
    throw new Error("Dados inválidos para renderizar o catálogo sincronizado.");
  }

  const logoClasses = extractLogoClasses(html);
  const brandLogos = new Map((catalog.brandLogos || []).map(({ name, imageUrl }) => [normalize(name), imageUrl]));
  const activeProducts = catalog.products.filter((product) => !product.isDeleted);
  const supportedCategories = new Set(
    CATEGORY_CONFIG.flatMap((config) => config.sourceCategories.map(normalize)),
  );
  const unknownCategories = [
    ...new Set(
      activeProducts
        .map((product) => normalize(product.category))
        .filter((category) => !supportedCategories.has(category)),
    ),
  ];

  if (unknownCategories.length > 0) {
    throw new Error(
      `Categorias CURE sem destino no PHENIX: ${unknownCategories.join(", ")}.`,
    );
  }

  let renderedHtml = html;
  for (const config of CATEGORY_CONFIG) {
    const acceptedCategories = new Set(config.sourceCategories.map(normalize));
    const products = activeProducts.filter((product) =>
      acceptedCategories.has(normalize(product.category)),
    );

    if (products.length === 0) {
      throw new Error(`A categoria ${config.label} ficou vazia durante a sincronização.`);
    }

    renderedHtml = replaceCategory(renderedHtml, config, products, logoClasses, brandLogos);
  }

  renderedHtml = applyCureFreightToHtml(renderedHtml, catalog.freight);
  return injectCatalogSyncAssets(renderedHtml, catalog.version);
}

function applyCureFreightToHtml(html, freight) {
  if (!Array.isArray(freight) || freight.length !== 27) {
    throw new Error("Dados inválidos para renderizar os fretes sincronizados.");
  }
  const details = findDetailsBlock(html, "frete");
  let block = details.block;
  for (const { uf, values } of freight) {
    const pattern = new RegExp(`(<div class="frete-result-panel" data-uf="${uf}">)\\s*(?:<div><span>[^<]*</span><strong>[^<]*</strong></div>\\s*){3}`);
    if (!pattern.test(block)) throw new Error(`Painel de frete ausente: ${uf}.`);
    const cards = [["sedex", "Sedex"], ["pac", "PAC"], ["transportadora", "Transportadora"]]
      .map(([mode, label]) => `<div><span>${label}</span><strong>${values[mode] == null ? "Consultar" : escapeHtml(formatPrice(values[mode]))}</strong></div>`)
      .join("\n            ");
    block = block.replace(pattern, (_, opening) => `${opening}\n            ${cards}\n          `);
  }
  return `${html.slice(0, details.start)}${block}${html.slice(details.end)}`;
}

module.exports = {
  CATEGORY_CONFIG,
  applyCureCatalogToHtml,
  applyCureFreightToHtml,
  formatPrice,
  injectCatalogSyncAssets,
  normalize,
  slug,
};
