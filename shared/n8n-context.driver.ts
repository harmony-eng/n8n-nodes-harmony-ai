import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  IHttpRequestOptions,
  INode,
  IWebhookFunctions,
} from "n8n-workflow";

import type { RecordedRequest, RecordedResponse } from "./n8n-context.types.ts";

const NODE: INode = {
  id: "node-1",
  name: "Harmony AI",
  type: "n8n-nodes-harmony-ai.harmonyAi",
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};

function readParameter({
  parameters,
  name,
  fallback,
}: {
  parameters: IDataObject;
  name: string;
  fallback: unknown;
}): unknown {
  const value = name
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object" ? (current as IDataObject)[key] : undefined,
      parameters,
    );

  return value === undefined ? fallback : value;
}

export class N8nContextDriver {
  readonly requests: RecordedRequest[] = [];
  readonly response: RecordedResponse = {};
  readonly staticData: IDataObject = {};
  #parameters: IDataObject;
  #respond: (request: RecordedRequest) => unknown;

  constructor({
    parameters,
    respond = () => ({}),
  }: {
    parameters: IDataObject;
    respond?: (request: RecordedRequest) => unknown;
  }) {
    this.#parameters = parameters;
    this.#respond = respond;
  }

  #base() {
    return {
      getNode: () => NODE,
      getWorkflowStaticData: () => this.staticData,
      continueOnFail: () => false,
    };
  }

  request({ index }: { index: number }): RecordedRequest {
    const request = this.requests[index];

    if (!request) {
      throw new Error(
        `No Harmony request at index ${String(index)}; ${String(this.requests.length)} were sent`,
      );
    }

    return request;
  }

  #helpers() {
    return {
      httpRequestWithAuthentication: async (
        credentialsType: string,
        options: IHttpRequestOptions,
      ) => {
        const request = { credentialsType, options };

        this.requests.push(request);

        return await Promise.resolve(this.#respond(request));
      },
    };
  }

  execute(): IExecuteFunctions {
    const context: Partial<IExecuteFunctions> = {
      ...this.#base(),
      helpers: this.#helpers() as IExecuteFunctions["helpers"],
      getInputData: () => [{ json: {} }],
      getNodeParameter: ((name: string, _itemIndex: number, fallback?: unknown) =>
        readParameter({
          parameters: this.#parameters,
          name,
          fallback,
        })) as IExecuteFunctions["getNodeParameter"],
    };

    return context as IExecuteFunctions;
  }

  hook(): IHookFunctions {
    const context: Partial<IHookFunctions> = {
      ...this.#base(),
      helpers: this.#helpers() as IHookFunctions["helpers"],
      getNodeWebhookUrl: () => "https://n8n.example.com/webhook/abc/webhook",
      getWorkflow: () => ({ id: "wf-1", name: "Qualified leads to CRM", active: true }),
      getNodeParameter: ((name: string, fallback?: unknown) =>
        readParameter({
          parameters: this.#parameters,
          name,
          fallback,
        })) as IHookFunctions["getNodeParameter"],
    };

    return context as IHookFunctions;
  }

  webhook({ headers, rawBody }: { headers: IDataObject; rawBody: string }): IWebhookFunctions {
    const response = this.response;

    const responseObject = {
      status(code: number) {
        response.status = code;

        return responseObject;
      },
      json(body: unknown) {
        response.body = body;

        return responseObject;
      },
    };

    const context: Partial<IWebhookFunctions> = {
      ...this.#base(),
      helpers: this.#helpers() as IWebhookFunctions["helpers"],
      getHeaderData: (() => headers) as IWebhookFunctions["getHeaderData"],
      getBodyData: () => JSON.parse(rawBody) as IDataObject,
      getRequestObject: (() => ({
        rawBody: Buffer.from(rawBody, "utf8"),
      })) as IWebhookFunctions["getRequestObject"],
      getResponseObject: (() => responseObject) as IWebhookFunctions["getResponseObject"],
      getNodeParameter: ((name: string, fallback?: unknown) =>
        readParameter({
          parameters: this.#parameters,
          name,
          fallback,
        })) as IWebhookFunctions["getNodeParameter"],
    };

    return context as IWebhookFunctions;
  }
}
