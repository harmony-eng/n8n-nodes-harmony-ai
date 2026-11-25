import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { HARMONY_PACKAGE_VERSION, HARMONY_USER_AGENT } from "./harmony-api.constants.ts";

describe("HARMONY_USER_AGENT", () => {
  it("names the published package version", () => {
    // Arrange
    const packageJson: unknown = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );

    // Act
    const { version } = packageJson as { version: string };

    // Assert
    assert.equal(HARMONY_PACKAGE_VERSION, version);
    assert.equal(HARMONY_USER_AGENT, `harmony-n8n/${version}`);
  });
});
