const fs = require("node:fs");
const path = require("node:path");

const { applyCureCatalogToHtml, injectCatalogSyncAssets } = require(
  "./_catalog-renderer",
);
const { getCureCatalog } = require("./_cure-catalog");
const { hasPrivateAccess } = require("./_private-auth");

const page = fs.readFileSync(
  path.join(process.cwd(), "TABELAPHX.html"),
  "utf8",
);

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (!hasPrivateAccess(request)) {
    return response.status(404).send("Página não encontrada");
  }

  let renderedPage;
  try {
    const catalog = await getCureCatalog({ maxAgeMs: 15000 });
    renderedPage = applyCureCatalogToHtml(page, catalog);
  } catch (error) {
    console.error("CURE catalog sync failed:", error);
    renderedPage = injectCatalogSyncAssets(page, "static");
  }

  return response
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(renderedPage);
};
