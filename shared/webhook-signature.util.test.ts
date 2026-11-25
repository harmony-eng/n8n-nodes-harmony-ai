import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { isValidWebhookSignature } from "./webhook-signature.util.ts";

const secretBytes = randomBytes(32);
const secret = `whsec_${secretBytes.toString("base64")}`;
const nowSeconds = 1_800_000_000;

function sign({
  webhookId,
  timestamp,
  body,
}: {
  webhookId: string;
  timestamp: number;
  body: string;
}) {
  const digest = createHmac("sha256", secretBytes)
    .update(`${webhookId}.${String(timestamp)}.${body}`, "utf8")
    .digest("base64");

  return `v1,${digest}`;
}

function signedRequest({ timestamp = nowSeconds, body = '{"event":"call_ended"}' } = {}) {
  const webhookId = "msg_1";

  return {
    headers: {
      webhookId,
      webhookTimestamp: String(timestamp),
      webhookSignature: sign({ webhookId, timestamp, body }),
    },
    rawBody: Buffer.from(body, "utf8"),
  };
}

describe("isValidWebhookSignature", () => {
  it("accepts a request Harmony signed with the endpoint's secret", () => {
    // Arrange
    const request = signedRequest();

    // Act
    const valid = isValidWebhookSignature({ secret, nowSeconds, ...request });

    // Assert
    assert.equal(valid, true);
  });

  it("accepts the matching signature among several space-separated ones", () => {
    // Arrange
    const request = signedRequest();
    request.headers.webhookSignature = `v1,${randomBytes(32).toString("base64")} ${request.headers.webhookSignature}`;

    // Act
    const valid = isValidWebhookSignature({ secret, nowSeconds, ...request });

    // Assert
    assert.equal(valid, true);
  });

  it("rejects a body changed after signing", () => {
    // Arrange
    const request = signedRequest();
    request.rawBody = Buffer.from('{"event":"call_started"}', "utf8");

    // Act
    const valid = isValidWebhookSignature({ secret, nowSeconds, ...request });

    // Assert
    assert.equal(valid, false);
  });

  it("rejects a signature made with another secret", () => {
    // Arrange
    const request = signedRequest();
    const otherSecret = `whsec_${randomBytes(32).toString("base64")}`;

    // Act
    const valid = isValidWebhookSignature({
      secret: otherSecret,
      nowSeconds,
      ...request,
    });

    // Assert
    assert.equal(valid, false);
  });

  it("rejects a timestamp more than five minutes from now", () => {
    // Arrange
    const request = signedRequest({ timestamp: nowSeconds - 301 });

    // Act
    const valid = isValidWebhookSignature({ secret, nowSeconds, ...request });

    // Assert
    assert.equal(valid, false);
  });

  it("rejects a request missing the signature header", () => {
    // Arrange
    const request = signedRequest();

    // Act
    const valid = isValidWebhookSignature({
      secret,
      nowSeconds,
      rawBody: request.rawBody,
      headers: { ...request.headers, webhookSignature: undefined },
    });

    // Assert
    assert.equal(valid, false);
  });
});
