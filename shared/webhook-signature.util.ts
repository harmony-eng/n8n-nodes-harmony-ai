import { createHmac, timingSafeEqual } from "node:crypto";

import { WEBHOOK_SIGNATURE_TOLERANCE_SECONDS } from "./harmony-api.constants.ts";
import type { WebhookHeaders } from "./harmony-api.types.ts";

const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";

export function isValidWebhookSignature({
  secret,
  headers,
  rawBody,
  nowSeconds,
}: {
  secret: string;
  headers: WebhookHeaders;
  rawBody: Buffer;
  nowSeconds: number;
}): boolean {
  const { webhookId, webhookTimestamp, webhookSignature } = headers;
  if (!webhookId || !webhookTimestamp || !webhookSignature || !secret.startsWith(SECRET_PREFIX)) {
    return false;
  }

  const timestampSeconds = Number(webhookTimestamp);
  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", Buffer.from(secret.slice(SECRET_PREFIX.length), "base64"))
    .update(`${webhookId}.${webhookTimestamp}.`, "utf8")
    .update(rawBody)
    .digest();

  return webhookSignature.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== SIGNATURE_VERSION || !signature) {
      return false;
    }
    const received = Buffer.from(signature, "base64");

    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
