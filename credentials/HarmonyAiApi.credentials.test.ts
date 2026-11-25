import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HarmonyAiApi } from "./HarmonyAiApi.credentials.ts";

describe("HarmonyAiApi", () => {
  it("sends each request to the detected region with the API key", async () => {
    // Arrange
    const credential = new HarmonyAiApi();

    // Act
    const options = await credential.authenticate(
      { apiKey: "harmony_pk_eu", baseUrl: "https://api.eu.harmony.ai" },
      { url: "/api/v1/me", headers: { "User-Agent": "harmony-n8n/0.1.0" } },
    );

    // Assert
    assert.equal(options.baseURL, "https://api.eu.harmony.ai");
    assert.deepEqual(options.headers, {
      "User-Agent": "harmony-n8n/0.1.0",
      Authorization: "Bearer harmony_pk_eu",
    });
  });
});
