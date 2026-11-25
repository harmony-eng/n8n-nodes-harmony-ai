import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IWebhookFunctions,
} from "n8n-workflow";

import type {
  BulkUpsertContactsData,
  BulkUpsertContactsResponse,
  CreateWebhookEndpointData,
  CreateWebhookEndpointResponse,
  ListContactCallsByExternalIdResponse,
  ListWorkflowsResponse,
  UpdateContactByExternalIdData,
  UpsertContactData,
} from "./harmony-public-api.gen.ts";

export type HarmonyHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HarmonyRequest {
  method: HarmonyHttpMethod;
  path: string;
  body?: object;
  qs?: Record<string, string | number | string[]>;
}

export type UpsertContactBody = UpsertContactData["body"];

export type BulkUpsertContactsBody = BulkUpsertContactsData["body"];

export type BulkUpsertContactsResult = BulkUpsertContactsResponse;

export type UpdateContactByExternalIdBody = UpdateContactByExternalIdData["body"];

export type ContactSourceKind = UpsertContactBody["sourceKind"];

export type ContactStatus = NonNullable<UpsertContactBody["status"]>;

export type CreateWebhookEndpointBody = CreateWebhookEndpointData["body"];

export type WebhookEventType = CreateWebhookEndpointBody["eventType"];

export type CreatedWebhookEndpoint = CreateWebhookEndpointResponse;

export type WorkflowPage = ListWorkflowsResponse;

export type ContactCallsPage = ListContactCallsByExternalIdResponse;

export interface WebhookHeaders {
  webhookId: string | undefined;
  webhookTimestamp: string | undefined;
  webhookSignature: string | undefined;
}

export type HarmonyContext =
  | IExecuteFunctions
  | ILoadOptionsFunctions
  | IHookFunctions
  | IWebhookFunctions;

export type ContactFields = Omit<
  UpdateContactByExternalIdBody,
  "sourceKind" | "externalId" | "status"
>;

export interface CustomFieldEntry {
  key: string;
  value: string;
}

export interface EndpointStaticData {
  endpointId?: string;
  secret?: string;
}

export interface CallWebhook extends IDataObject {
  event: string;
  timestamp: string;
  details: IDataObject & { callId?: string };
}

export interface RecordingLink {
  url: string | null;
  expiresAt: string | null;
}
