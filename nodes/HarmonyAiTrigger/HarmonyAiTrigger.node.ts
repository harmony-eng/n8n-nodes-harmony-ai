import {
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type IHookFunctions,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  type INodeType,
  type INodeTypeDescription,
  type IWebhookFunctions,
  type IWebhookResponseData,
} from "n8n-workflow";

import { HARMONY_CREDENTIAL_NAME } from "../../shared/harmony-api.constants.ts";
import type {
  CallWebhook,
  CreatedWebhookEndpoint,
  EndpointStaticData,
  RecordingLink,
  CreateWebhookEndpointBody,
  WebhookEventType,
} from "../../shared/harmony-api.types.ts";
import { harmonyApiRequest, listAgentOptions } from "../../shared/harmony-api.util.ts";
import { isValidWebhookSignature } from "../../shared/webhook-signature.util.ts";

const DESCRIPTION_MAX_LENGTH = 512;
const CONTACT_CALLS_FINISHED = "contact_calls_finished";

function webhookEventType({ event }: { event: string }): WebhookEventType {
  return event === CONTACT_CALLS_FINISHED ? "call_ended" : (event as WebhookEventType);
}

function headerValue({
  headers,
  name,
}: {
  headers: IDataObject;
  name: string;
}): string | undefined {
  const value = headers[name];

  return typeof value === "string" ? value : undefined;
}

async function recordingBinary({
  context,
  callId,
}: {
  context: IWebhookFunctions;
  callId: string;
}): Promise<
  | {
      recording: Awaited<ReturnType<IWebhookFunctions["helpers"]["prepareBinaryData"]>>;
    }
  | undefined
> {
  const link = await harmonyApiRequest<RecordingLink>({
    context,
    request: {
      method: "GET",
      path: `/api/v1/calls/${encodeURIComponent(callId)}/recording`,
    },
  });

  if (!link.url) {
    return undefined;
  }

  const audio = (await context.helpers.httpRequest({
    method: "GET",
    url: link.url,
    encoding: "arraybuffer",
  })) as ArrayBuffer;

  return {
    recording: await context.helpers.prepareBinaryData(Buffer.from(audio), `${callId}.mp3`),
  };
}

export class HarmonyAiTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Harmony AI Trigger",
    name: "harmonyAiTrigger",
    icon: { light: "file:harmonyAi.svg", dark: "file:harmonyAi.dark.svg" },
    group: ["trigger"],
    version: 1,
    subtitle: '={{$parameter["event"]}}',
    description: "Start a flow when a Harmony AI call starts, ends, or has a recording",
    defaults: { name: "Harmony AI Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: HARMONY_CREDENTIAL_NAME, required: true }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Event",
        name: "event",
        type: "options",
        required: true,
        options: [
          {
            name: "Call Ended",
            value: "call_ended",
            description: "A call ended and its summary is ready, including unanswered attempts",
          },
          {
            name: "Call Recording Ready",
            value: "call_recording_ready",
            description: "A call's recording is stored, usually a few seconds after it ends",
          },
          {
            name: "Call Started",
            value: "call_started",
            description: "A call attempt began, before it is answered",
          },
          {
            name: "Contact Calls Finished",
            value: CONTACT_CALLS_FINISHED,
            description: "A call ended and Harmony has no further call scheduled for the contact",
          },
        ],
        default: "call_ended",
      },
      {
        displayName: "Voice Agent Name or ID",
        name: "agentId",
        type: "options",
        typeOptions: { loadOptionsMethod: "getVoiceAgents" },
        default: "",
        description:
          'Only this agent\'s calls start the flow. Leave empty for every agent. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: "Download Recording",
        name: "downloadRecording",
        type: "boolean",
        default: true,
        description: "Whether to attach the recording audio as binary data named recording",
        displayOptions: { show: { event: ["call_recording_ready"] } },
      },
    ],
  };

  methods = {
    loadOptions: {
      async getVoiceAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const agents = await listAgentOptions({ context: this });

        return [{ name: "All Agents", value: "" }, ...agents];
      },
    },
  };

  webhookMethods = {
    default: {
      checkExists(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData("node") as EndpointStaticData;

        return Promise.resolve(Boolean(staticData.endpointId && staticData.secret));
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const eventType = webhookEventType({ event: this.getNodeParameter("event") as string });
        const agentId = this.getNodeParameter("agentId", "") as string;
        const url = this.getNodeWebhookUrl("default");

        if (!url) {
          throw new NodeOperationError(
            this.getNode(),
            "n8n did not provide a webhook URL for this trigger",
          );
        }

        const body: CreateWebhookEndpointBody = {
          eventType,
          url,
          description: `n8n: ${this.getWorkflow().name ?? "flow"}`.slice(0, DESCRIPTION_MAX_LENGTH),
          enabled: true,
          filters: agentId ? { agentId } : {},
        };

        const created = await harmonyApiRequest<CreatedWebhookEndpoint>({
          context: this,
          request: { method: "POST", path: "/api/v1/webhooks", body },
        });

        const staticData = this.getWorkflowStaticData("node") as EndpointStaticData;

        staticData.endpointId = created.endpoint.id;
        staticData.secret = created.secret;

        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData("node") as EndpointStaticData;

        if (staticData.endpointId) {
          await harmonyApiRequest({
            context: this,
            request: {
              method: "DELETE",
              path: `/api/v1/webhooks/${encodeURIComponent(staticData.endpointId)}`,
            },
          }).catch((error: unknown) => {
            if (!(error instanceof NodeApiError && error.httpCode === "404")) {
              throw error;
            }
          });
        }
        delete staticData.endpointId;
        delete staticData.secret;

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const { secret } = this.getWorkflowStaticData("node") as EndpointStaticData;
    const headers = this.getHeaderData() as IDataObject;
    const request = this.getRequestObject();

    const valid =
      secret !== undefined &&
      isValidWebhookSignature({
        secret,
        rawBody: request.rawBody,
        nowSeconds: Math.floor(Date.now() / 1000),
        headers: {
          webhookId: headerValue({ headers, name: "webhook-id" }),
          webhookTimestamp: headerValue({ headers, name: "webhook-timestamp" }),
          webhookSignature: headerValue({ headers, name: "webhook-signature" }),
        },
      });

    if (!valid) {
      this.getResponseObject().status(401).json({ error: "Invalid Harmony webhook signature" });

      return { noWebhookResponse: true };
    }

    const payload = this.getBodyData() as CallWebhook;
    if (payload.event === "test_event") {
      return { webhookResponse: "ignored test event" };
    }

    if (
      this.getNodeParameter("event") === CONTACT_CALLS_FINISHED &&
      payload.details.isLastCall !== true
    ) {
      return { webhookResponse: "ignored call with more calls scheduled" };
    }

    const json: IDataObject = {
      event: payload.event,
      timestamp: payload.timestamp,
      webhookId: headerValue({ headers, name: "webhook-id" }),
      ...payload.details,
    };

    const callId = payload.details.callId;

    const binary =
      payload.event === "call_recording_ready" &&
      callId &&
      (this.getNodeParameter("downloadRecording", true) as boolean)
        ? await recordingBinary({ context: this, callId })
        : undefined;

    return { workflowData: [[{ json, ...(binary ? { binary } : {}) }]] };
  }
}
