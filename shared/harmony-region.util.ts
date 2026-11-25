import type { IHttpRequestHelper, IN8nHttpFullResponse } from "n8n-workflow";

import { HARMONY_REGION_BASE_URLS, HARMONY_USER_AGENT } from "./harmony-api.constants.ts";

const UNAUTHORIZED = 401;

export async function detectHarmonyBaseUrl({
  helpers,
  apiKey,
}: {
  helpers: IHttpRequestHelper["helpers"];
  apiKey: string;
}): Promise<string> {
  for (const baseUrl of Object.values(HARMONY_REGION_BASE_URLS)) {
    const response = (await helpers.httpRequest({
      method: "GET",
      baseURL: baseUrl,
      url: "/api/v1/me",
      headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": HARMONY_USER_AGENT },
      json: true,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    })) as IN8nHttpFullResponse;

    if (response.statusCode < 300) {
      return baseUrl;
    }

    if (response.statusCode !== UNAUTHORIZED) {
      throw new Error(
        `Harmony returned ${String(response.statusCode)} from ${baseUrl} while checking the API key`,
      );
    }
  }

  throw new Error(
    "Harmony accepted this API key in neither the US nor the EU region. Check it in Settings > Developers.",
  );
}
