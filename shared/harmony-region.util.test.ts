import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IHttpRequestHelper, IHttpRequestOptions } from "n8n-workflow";

import { detectHarmonyBaseUrl } from "./harmony-region.util.ts";

function helpersAnswering({ statusByBaseUrl }: { statusByBaseUrl: Record<string, number> }) {
  const requests: IHttpRequestOptions[] = [];

  const helpers: IHttpRequestHelper["helpers"] = {
    httpRequest: async (options: IHttpRequestOptions) => {
      requests.push(options);

      return await Promise.resolve({
        statusCode: statusByBaseUrl[options.baseURL ?? ""],
        body: {},
        headers: {},
      });
    },
  };

  return { helpers, requests };
}

describe("detectHarmonyBaseUrl", () => {
  it("uses the US API when it accepts the key, without asking the EU API", async () => {
    // Arrange
    const { helpers, requests } = helpersAnswering({
      statusByBaseUrl: { "https://api.harmony.ai": 200 },
    });

    // Act
    const baseUrl = await detectHarmonyBaseUrl({ helpers, apiKey: "harmony_pk_us" });

    // Assert
    assert.equal(baseUrl, "https://api.harmony.ai");
    assert.deepEqual(
      requests.map((request) => ({ url: request.url, headers: request.headers })),
      [
        {
          url: "/api/v1/me",
          headers: { Authorization: "Bearer harmony_pk_us", "User-Agent": "harmony-n8n/0.1.0" },
        },
      ],
    );
  });

  it("falls back to the EU API when the US API rejects the key with 401", async () => {
    // Arrange
    const { helpers } = helpersAnswering({
      statusByBaseUrl: { "https://api.harmony.ai": 401, "https://api.eu.harmony.ai": 200 },
    });

    // Act
    const baseUrl = await detectHarmonyBaseUrl({ helpers, apiKey: "harmony_pk_eu" });

    // Assert
    assert.equal(baseUrl, "https://api.eu.harmony.ai");
  });

  it("fails when neither region accepts the key", async () => {
    // Arrange
    const { helpers } = helpersAnswering({
      statusByBaseUrl: { "https://api.harmony.ai": 401, "https://api.eu.harmony.ai": 401 },
    });

    // Act
    const run = detectHarmonyBaseUrl({ helpers, apiKey: "harmony_pk_revoked" });

    // Assert
    await assert.rejects(run, /neither the US nor the EU region/);
  });

  it("fails without trying the EU API when the US API errors with anything but 401", async () => {
    // Arrange
    const { helpers, requests } = helpersAnswering({
      statusByBaseUrl: { "https://api.harmony.ai": 503 },
    });

    // Act
    const run = detectHarmonyBaseUrl({ helpers, apiKey: "harmony_pk_us" });

    // Assert
    await assert.rejects(run, /Harmony returned 503 from https:\/\/api\.harmony\.ai/);
    assert.equal(requests.length, 1);
  });
});
