const fs = require("node:fs");
const path = require("node:path");

const publicAssets = new Map([
  ["BOTÃO.png", "image/png"],
  ["COMBOS.png", "image/png"],
  ["head.png", "image/png"],
  ["INFORMAÇÕES.png", "image/png"],
  ["intro.png", "image/png"],
  ["logo phx-03.svg", "image/svg+xml"],
  ["PAGINA 2.png", "image/png"],
  ["PHX BLACK.svg", "image/svg+xml"],
]);

module.exports = function handler(request, response) {
  const requestedFile = String(request.query.file || "");
  const fileName = path.basename(requestedFile);
  const contentType = publicAssets.get(fileName);

  if (!contentType || requestedFile !== fileName) {
    return response.status(404).send("Arquivo não encontrado");
  }

  const filePath = path.join(process.cwd(), "PAGINAS", fileName);
  if (!fs.existsSync(filePath)) {
    return response.status(404).send("Arquivo não encontrado");
  }

  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return response.status(200).send(fs.readFileSync(filePath));
};
