import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { N8nContextDriver } from "../../shared/n8n-context.driver.ts";

import { HarmonyAiTrigger } from "./HarmonyAiTrigger.node.ts";

const secretBytes = randomBytes(32);
const secret = `whsec_${secretBytes.toString("base64")}`;
const trigger = new HarmonyAiTrigger();

function signedHeaders({ body }: { body: string }) {
  const webhookId = "msg_2mZ";
  const timestamp = String(Math.floor(Date.now() / 1000));

  const digest = createHmac("sha256", secretBytes)
    .update(`${webhookId}.${timestamp}.${body}`, "utf8")
    .digest("base64");

  return {
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${digest}`,
  };
}

function subscribedDriver({ parameters = {} }: { parameters?: Record<string, unknown> } = {}) {
  const driver = new N8nContextDriver({ parameters: { event: "call_ended", ...parameters } });

  driver.staticData.endpointId = "0196f0b4-2a1c-7d3e-8f40-5b6c7d8e9f0a";
  driver.staticData.secret = secret;

  return driver;
}

describe("HarmonyAiTrigger", () => {
  it("creates an enabled Webhook endpoint for the chosen event and agent and keeps its secret", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        event: "call_recording_ready",
        agentId: "0196e8c1-4b2a-7c3d-9e5f-6a7b8c9d0e1f",
      },
      respond: () => ({ endpoint: { id: "endpoint-1" }, secret }),
    });

    // Act
    await trigger.webhookMethods.default.create.call(driver.hook());

    // Assert
    assert.deepEqual(driver.request({ index: 0 }).options.body, {
      eventType: "call_recording_ready",
      url: "https://n8n.example.com/webhook/abc/webhook",
      description: "n8n: Qualified leads to CRM",
      enabled: true,
      filters: { agentId: "0196e8c1-4b2a-7c3d-9e5f-6a7b8c9d0e1f" },
    });
    assert.equal(driver.request({ index: 0 }).options.url, "/api/v1/webhooks");
    assert.deepEqual(driver.staticData, { endpointId: "endpoint-1", secret });
  });

  it("sends no agent filter when every agent is chosen", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: { event: "call_started", agentId: "" },
      respond: () => ({ endpoint: { id: "endpoint-1" }, secret }),
    });

    // Act
    await trigger.webhookMethods.default.create.call(driver.hook());

    // Assert
    assert.deepEqual(
      (driver.request({ index: 0 }).options.body as { filters: object }).filters,
      {},
    );
  });

  it("subscribes Contact Calls Finished to Call Ended", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: { event: "contact_calls_finished", agentId: "" },
      respond: () => ({ endpoint: { id: "endpoint-1" }, secret }),
    });

    // Act
    await trigger.webhookMethods.default.create.call(driver.hook());

    // Assert
    assert.equal(
      (driver.request({ index: 0 }).options.body as { eventType: string }).eventType,
      "call_ended",
    );
  });

  it("starts Contact Calls Finished only for a contact's last call", async () => {
    // Arrange
    const driver = subscribedDriver({ parameters: { event: "contact_calls_finished" } });

    const notification = ({ isLastCall }: { isLastCall: boolean }) =>
      JSON.stringify({
        event: "call_ended",
        timestamp: "2026-10-10T14:06:41.000Z",
        details: { callId: "call-1", isLastCall },
      });

    const moreCalls = notification({ isLastCall: false });
    const lastCall = notification({ isLastCall: true });

    // Act
    const skipped = await trigger.webhook.call(
      driver.webhook({ headers: signedHeaders({ body: moreCalls }), rawBody: moreCalls }),
    );

    const started = await trigger.webhook.call(
      driver.webhook({ headers: signedHeaders({ body: lastCall }), rawBody: lastCall }),
    );

    // Assert
    assert.equal(skipped.workflowData, undefined);
    assert.equal(started.workflowData?.[0]?.[0]?.json.isLastCall, true);
  });

  it("deletes the endpoint and forgets it when the flow is turned off", async () => {
    // Arrange
    const driver = subscribedDriver();

    // Act
    await trigger.webhookMethods.default.delete.call(driver.hook());

    // Assert
    assert.equal(driver.request({ index: 0 }).options.method, "DELETE");
    assert.equal(
      driver.request({ index: 0 }).options.url,
      "/api/v1/webhooks/0196f0b4-2a1c-7d3e-8f40-5b6c7d8e9f0a",
    );
    assert.deepEqual(driver.staticData, {});
  });

  it("starts the flow with the call details of a correctly signed notification", async () => {
    // Arrange
    const driver = subscribedDriver();

    const body = JSON.stringify({
      event: "call_ended",
      timestamp: "2026-10-10T14:06:41.000Z",
      details: { callId: "call-1", callResult: "qualified" },
    });

    // Act
    const result = await trigger.webhook.call(
      driver.webhook({ headers: signedHeaders({ body }), rawBody: body }),
    );

    // Assert
    assert.deepEqual(result.workflowData?.[0]?.[0]?.json, {
      event: "call_ended",
      timestamp: "2026-10-10T14:06:41.000Z",
      webhookId: "msg_2mZ",
      callId: "call-1",
      callResult: "qualified",
    });
  });

  it("rejects a notification whose signature fails with 401 and starts no flow", async () => {
    // Arrange
    const driver = subscribedDriver();

    const body = JSON.stringify({
      event: "call_ended",
      timestamp: "2026-10-10T14:06:41.000Z",
      details: {},
    });

    const headers = signedHeaders({ body: `${body} ` });

    // Act
    const result = await trigger.webhook.call(driver.webhook({ headers, rawBody: body }));

    // Assert
    assert.equal(driver.response.status, 401);
    assert.equal(result.noWebhookResponse, true);
    assert.equal(result.workflowData, undefined);
  });

  it("ignores a test event sent from Settings", async () => {
    // Arrange
    const driver = subscribedDriver();

    const body = JSON.stringify({
      event: "test_event",
      timestamp: "2026-10-10T14:06:41.000Z",
      details: {},
    });

    // Act
    const result = await trigger.webhook.call(
      driver.webhook({ headers: signedHeaders({ body }), rawBody: body }),
    );

    // Assert
    assert.equal(result.workflowData, undefined);
  });
});
