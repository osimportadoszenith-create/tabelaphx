const crypto = require("node:crypto");

function tokensMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function hasPrivateAccess(request) {
  const configuredToken = process.env.PRIVATE_ACCESS_TOKEN || "py";
  const receivedToken = Array.isArray(request.query.token)
    ? request.query.token[0]
    : request.query.token;

  return Boolean(
    configuredToken &&
      receivedToken &&
      tokensMatch(receivedToken, configuredToken),
  );
}

module.exports = { hasPrivateAccess, tokensMatch };
