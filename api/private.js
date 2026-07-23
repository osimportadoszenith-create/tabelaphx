const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const page = fs.readFileSync(
  path.join(process.cwd(), "TABELAPHX.html"),
  "utf8",
);

function tokensMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

module.exports = function handler(request, response) {
  const configuredToken = process.env.PRIVATE_ACCESS_TOKEN || "py";
  const receivedToken = Array.isArray(request.query.token)
    ? request.query.token[0]
    : request.query.token;

  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (
    !configuredToken ||
    !receivedToken ||
    !tokensMatch(receivedToken, configuredToken)
  ) {
    return response.status(404).send("Página não encontrada");
  }

  return response
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(page);
};
