import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { N8nContextDriver } from "../../shared/n8n-context.driver.ts";

import { HarmonyAi } from "./HarmonyAi.node.ts";

const node = new HarmonyAi();

describe("HarmonyAi", () => {
  it("enrolls the contact in the chosen workflow with ordinary enrollment", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        resource: "contact",
        operation: "addToWorkflow",
        workflowId: "0196e8c1-4b2a-7c3d-9e5f-6a7b8c9d0e1f",
        sourceKind: "api",
        externalId: "lead-42",
        contactFields: { firstName: "Dana", phone: "+12125550199" },
        customFields: { field: [{ key: "company", value: "Acme" }] },
      },
      respond: () => ({ accepted: 1, rejected: [] }),
    });

    // Act
    const [output] = await node.execute.call(driver.execute());

    // Assert
    assert.equal(driver.request({ index: 0 }).options.url, "/api/v1/contacts/bulk");
    assert.deepEqual(driver.request({ index: 0 }).options.body, {
      assignmentOptions: { workflowId: "0196e8c1-4b2a-7c3d-9e5f-6a7b8c9d0e1f" },
      contacts: [
        {
          firstName: "Dana",
          phone: "+12125550199",
          customFields: { company: "Acme" },
          sourceKind: "api",
          externalId: "lead-42",
        },
      ],
    });
    assert.equal(output?.[0]?.json.accepted, true);
  });

  it("fails the item with Harmony's reason when the contact is rejected", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        resource: "contact",
        operation: "addToWorkflow",
        workflowId: "wf-1",
        sourceKind: "api",
        contactFields: {},
      },
      respond: () => ({ accepted: 0, rejected: [{ reason: "invalid-phone", index: 0 }] }),
    });

    // Act
    const run = node.execute.call(driver.execute());

    // Assert
    await assert.rejects(run, /Harmony rejected the contact: invalid-phone/);
  });

  it("sends an empty external ID as null so Harmony assigns one", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        resource: "contact",
        operation: "upsert",
        sourceKind: "api",
        externalId: "",
        contactFields: { phone: "+12125550199" },
      },
      respond: () => ({ id: "contact-1" }),
    });

    // Act
    await node.execute.call(driver.execute());

    // Assert
    assert.equal(driver.request({ index: 0 }).options.method, "PUT");
    assert.deepEqual(driver.request({ index: 0 }).options.body, {
      phone: "+12125550199",
      sourceKind: "api",
      externalId: null,
    });
  });

  it("updates the contact found by source kind and external ID, removing custom fields sent empty", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        resource: "contact",
        operation: "updateByExternalId",
        sourceKind: "hubspot",
        externalId: "123/45",
        updateFields: { lastName: "Levi" },
        customFields: { field: [{ key: "stage", value: "" }] },
      },
      respond: () => ({ id: "contact-1" }),
    });

    // Act
    await node.execute.call(driver.execute());

    // Assert
    assert.equal(driver.request({ index: 0 }).options.method, "PATCH");
    assert.equal(
      driver.request({ index: 0 }).options.url,
      "/api/v1/contacts/source/hubspot/external-id/123%2F45",
    );
    assert.deepEqual(driver.request({ index: 0 }).options.body, {
      lastName: "Levi",
      customFields: { stage: null },
    });
  });

  it("pages through a contact's calls until the limit and outputs one item per call", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {
        resource: "contact",
        operation: "getCalls",
        sourceKind: "salesforce",
        externalId: "lead-7",
        returnAll: false,
        limit: 3,
      },
      respond: (request) =>
        request.options.qs?.nextToken
          ? { data: [{ callId: "call-3" }], nextToken: "page-3" }
          : { data: [{ callId: "call-1" }, { callId: "call-2" }], nextToken: "page-2" },
    });

    // Act
    const [output] = await node.execute.call(driver.execute());

    // Assert
    assert.equal(
      driver.request({ index: 0 }).options.url,
      "/api/v1/contacts/source/salesforce/external-id/lead-7/calls",
    );
    assert.deepEqual(driver.request({ index: 1 }).options.qs, { limit: 1, nextToken: "page-2" });
    assert.equal(driver.requests.length, 2);
    assert.deepEqual(
      output?.map((item) => item.json.callId),
      ["call-1", "call-2", "call-3"],
    );
  });

  it("gets a call's transcript by call ID", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: { resource: "call", operation: "getTranscript", callId: "call-1" },
      respond: () => ({ utterances: [] }),
    });

    // Act
    await node.execute.call(driver.execute());

    // Assert
    assert.equal(driver.request({ index: 0 }).options.method, "GET");
    assert.equal(driver.request({ index: 0 }).options.url, "/api/v1/calls/call-1/transcript");
  });
});
