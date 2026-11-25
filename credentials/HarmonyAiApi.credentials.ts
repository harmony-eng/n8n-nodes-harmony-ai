import type {
  ICredentialDataDecryptedObject,
  ICredentialTestRequest,
  ICredentialType,
  IHttpRequestHelper,
  IHttpRequestOptions,
  Icon,
  INodeProperties,
} from "n8n-workflow";

import { HARMONY_USER_AGENT } from "../shared/harmony-api.constants.ts";
import { detectHarmonyBaseUrl } from "../shared/harmony-region.util.ts";

export class HarmonyAiApi implements ICredentialType {
  name = "harmonyAiApi";

  displayName = "Harmony AI API";

  icon: Icon = { light: "file:harmonyAi.svg", dark: "file:harmonyAi.dark.svg" };

  documentationUrl = "https://docs.harmony.ai/guides/deploy/integrations/n8n/overview/";

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      required: true,
      default: "",
      description:
        "A Harmony API key from Settings > Developers. It starts with harmony_pk_. Harmony finds your region from the key.",
    },
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "hidden",
      typeOptions: { expirable: true },
      default: "",
    },
  ];

  async preAuthentication(this: IHttpRequestHelper, credentials: ICredentialDataDecryptedObject) {
    return {
      baseUrl: await detectHarmonyBaseUrl({
        helpers: this.helpers,
        apiKey: credentials.apiKey as string,
      }),
    };
  }

  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    requestOptions: IHttpRequestOptions,
  ): Promise<IHttpRequestOptions> {
    return await Promise.resolve({
      ...requestOptions,
      baseURL: credentials.baseUrl as string,
      headers: {
        ...requestOptions.headers,
        Authorization: `Bearer ${credentials.apiKey as string}`,
      },
    });
  }

  test: ICredentialTestRequest = {
    request: {
      url: "/api/v1/me",
      headers: { "User-Agent": HARMONY_USER_AGENT },
    },
  };
}
