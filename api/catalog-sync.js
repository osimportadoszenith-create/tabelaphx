const { hasPrivateAccess } = require("./_private-auth");
const {
  AVAILABILITY_SYNC_ENABLED,
  getCureCatalog,
} = require("./_cure-catalog");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (!hasPrivateAccess(request)) {
    return response.status(404).json({ error: "not_found" });
  }

  try {
    const catalog = await getCureCatalog({ maxAgeMs: 15000 });
    const products = catalog.products.filter((product) => !product.isDeleted);

    return response.status(200).json({
      source: catalog.source,
      version: catalog.version,
      fetchedAt: catalog.fetchedAt,
      stale: Boolean(catalog.stale),
      products: products.length,
      availabilitySync: AVAILABILITY_SYNC_ENABLED,
      freightSource: catalog.freightSource,
      freightStates: catalog.freight.length,
      syncedFields: [
        "finalPrice",
        "presentation",
        "descriptionText",
        "displayBrand",
        "category",
        "group",
        "freight",
        "brandLogos",
      ],
    });
  } catch (error) {
    console.error("CURE catalog version check failed:", error);
    return response.status(503).json({ error: "sync_unavailable" });
  }
};
