import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listAgentOptions } from "./harmony-api.util.ts";
import { N8nContextDriver } from "./n8n-context.driver.ts";

describe("listAgentOptions", () => {
  it("names each agent without its workflow suffix and skips archived and agentless workflows", async () => {
    // Arrange
    const driver = new N8nContextDriver({
      parameters: {},
      respond: () => ({
        data: [
          { id: "wf-1", parentRefId: "agent-1", name: "prodi workflow", status: "draft" },
          { id: "wf-2", parentRefId: "agent-2", name: "Alert Workflow", status: "published" },
          { id: "wf-3", parentRefId: "agent-3", name: "Old workflow", status: "archived" },
          { id: "wf-4", parentRefId: null, name: "Standalone workflow", status: "draft" },
        ],
      }),
    });

    // Act
    const options = await listAgentOptions({ context: driver.loadOptions() });

    // Assert
    assert.deepEqual(
      options.map(({ name, value }) => ({ name, value })),
      [
        { name: "Alert", value: "agent-2" },
        { name: "prodi", value: "agent-1" },
      ],
    );
  });
});
