import {
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type ILoadOptionsFunctions,
  type INodeExecutionData,
  type INodePropertyOptions,
  type INodeType,
  type INodeTypeDescription,
} from "n8n-workflow";

import {
  contactFieldsProperty,
  customFieldsProperty,
  readContactFields,
  readSourceKind,
  sourceKindProperty,
} from "../../shared/contact-fields.util.ts";
import { HARMONY_CREDENTIAL_NAME } from "../../shared/harmony-api.constants.ts";
import type {
  AgentWorkflowIds,
  BulkUpsertContactsBody,
  BulkUpsertContactsResult,
  CallDetails,
  CallTranscript,
  ContactCallsPage,
  UpsertContactBody,
} from "../../shared/harmony-api.types.ts";
import {
  failureJson,
  findAgentWorkflowId,
  harmonyApiRequest,
  listAgentOptions,
} from "../../shared/harmony-api.util.ts";

const ADD_TO_AGENT = "addToAgent";
const UPSERT = "upsert";
const UPDATE = "updateByExternalId";
const GET = "get";
const GET_BY_EXTERNAL_ID = "getByExternalId";
const GET_CALLS = "getCalls";
const CALLS_PAGE_LIMIT = 100;

function externalIdPath({
  context,
  itemIndex,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
}): string {
  const sourceKind = readSourceKind({ context, itemIndex });

  const externalId = context.getNodeParameter("externalId", itemIndex) as string;

  return `/api/v1/contacts/source/${encodeURIComponent(sourceKind)}/external-id/${encodeURIComponent(externalId)}`;
}

async function listContactCalls({
  context,
  itemIndex,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
}): Promise<IDataObject[]> {
  const path = `${externalIdPath({ context, itemIndex })}/calls`;
  const returnAll = context.getNodeParameter("returnAll", itemIndex);

  const limit = returnAll ? Infinity : context.getNodeParameter("limit", itemIndex);

  const calls: IDataObject[] = [];
  let nextToken: string | undefined;
  do {
    const page = await harmonyApiRequest<ContactCallsPage>({
      context,
      itemIndex,
      request: {
        method: "GET",
        path,
        qs: {
          limit: Math.min(CALLS_PAGE_LIMIT, limit - calls.length),
          ...(nextToken ? { nextToken } : {}),
        },
      },
    });

    calls.push(...page.data);
    nextToken = page.nextToken;
  } while (nextToken && calls.length < limit);

  return calls;
}

async function getCall({
  context,
  itemIndex,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
}): Promise<IDataObject> {
  const callId = encodeURIComponent(context.getNodeParameter("callId", itemIndex) as string);
  const path = `/api/v1/calls/${callId}`;

  const includeTranscript = context.getNodeParameter("includeTranscript", itemIndex, false);
  if (!includeTranscript) {
    return await harmonyApiRequest<IDataObject>({
      context,
      itemIndex,
      request: { method: "GET", path },
    });
  }

  const [call, transcript] = await Promise.all([
    harmonyApiRequest<CallDetails>({ context, itemIndex, request: { method: "GET", path } }),
    harmonyApiRequest<CallTranscript>({
      context,
      itemIndex,
      request: { method: "GET", path: `${path}/transcript` },
    }),
  ]);

  return { ...call, transcript: transcript.utterances };
}

async function addToAgent({
  context,
  itemIndex,
  contact,
  agentWorkflowIds,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
  contact: UpsertContactBody;
  agentWorkflowIds: AgentWorkflowIds;
}): Promise<IDataObject> {
  const agentId = context.getNodeParameter("agentId", itemIndex) as string;

  const workflowId =
    agentWorkflowIds.get(agentId) ?? findAgentWorkflowId({ context, itemIndex, agentId });

  agentWorkflowIds.set(agentId, workflowId);

  const body: BulkUpsertContactsBody = {
    assignmentOptions: { workflowId: await workflowId },
    contacts: [contact],
  };

  const result = await harmonyApiRequest<BulkUpsertContactsResult>({
    context,
    itemIndex,
    request: { method: "POST", path: "/api/v1/contacts/bulk", body },
  });

  const rejection = result.rejected[0];
  if (rejection) {
    throw new NodeOperationError(
      context.getNode(),
      `Harmony rejected the contact: ${rejection.reason}`,
      {
        itemIndex,
      },
    );
  }

  return {
    accepted: true,
    agentId,
    sourceKind: contact.sourceKind,
    externalId: contact.externalId,
  };
}

async function runContactOperation({
  context,
  operation,
  itemIndex,
  agentWorkflowIds,
}: {
  context: IExecuteFunctions;
  operation: string;
  itemIndex: number;
  agentWorkflowIds: AgentWorkflowIds;
}): Promise<IDataObject | IDataObject[]> {
  if (operation === GET) {
    const contactId = context.getNodeParameter("contactId", itemIndex) as string;

    return await harmonyApiRequest<IDataObject>({
      context,
      itemIndex,
      request: { method: "GET", path: `/api/v1/contacts/${encodeURIComponent(contactId)}` },
    });
  }

  if (operation === GET_BY_EXTERNAL_ID) {
    return await harmonyApiRequest<IDataObject>({
      context,
      itemIndex,
      request: { method: "GET", path: externalIdPath({ context, itemIndex }) },
    });
  }

  if (operation === GET_CALLS) {
    return await listContactCalls({ context, itemIndex });
  }

  if (operation === UPDATE) {
    return await harmonyApiRequest<IDataObject>({
      context,
      itemIndex,
      request: {
        method: "PATCH",
        path: externalIdPath({ context, itemIndex }),
        body: readContactFields({ context, itemIndex, fieldsParameter: "updateFields" }),
      },
    });
  }

  const contact: UpsertContactBody = {
    ...readContactFields({ context, itemIndex, fieldsParameter: "contactFields" }),
    sourceKind: readSourceKind({ context, itemIndex }),
    externalId: (context.getNodeParameter("externalId", itemIndex, "") as string) || null,
  };

  if (operation === UPSERT) {
    return await harmonyApiRequest<IDataObject>({
      context,
      itemIndex,
      request: { method: "PUT", path: "/api/v1/contacts/upsert", body: contact },
    });
  }

  return await addToAgent({ context, itemIndex, contact, agentWorkflowIds });
}

export class HarmonyAi implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Harmony AI",
    name: "harmonyAi",
    icon: { light: "file:harmonyAi.svg", dark: "file:harmonyAi.dark.svg" },
    group: ["output"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      "Send contacts to Harmony AI voice agents and look up contacts, calls, and call transcripts",
    defaults: { name: "Harmony AI" },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: HARMONY_CREDENTIAL_NAME, required: true }],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          { name: "Call", value: "call" },
          { name: "Contact", value: "contact" },
        ],
        default: "contact",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["contact"] } },
        options: [
          {
            name: "Add to Agent",
            value: ADD_TO_AGENT,
            action: "Add a contact to an agent",
            description:
              "Create or update a contact and send it to a voice agent. Harmony calls it on the agent's schedule.",
          },
          {
            name: "Create or Update",
            value: UPSERT,
            action: "Create or update a contact",
            description: "Update the matching contact, or create one when none matches",
          },
          { name: "Get", value: GET, action: "Get a contact" },
          {
            name: "Get by External ID",
            value: GET_BY_EXTERNAL_ID,
            action: "Get a contact by external ID",
          },
          {
            name: "Get Calls",
            value: GET_CALLS,
            action: "Get calls for a contact",
          },
          {
            name: "Update by External ID",
            value: UPDATE,
            action: "Update a contact by external ID",
          },
        ],
        default: ADD_TO_AGENT,
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["call"] } },
        options: [{ name: "Get", value: GET, action: "Get a call" }],
        default: GET,
      },
      {
        displayName: "Voice Agent Name or ID",
        name: "agentId",
        type: "options",
        typeOptions: { loadOptionsMethod: "getVoiceAgents" },
        required: true,
        default: "",
        description:
          'The agent that calls the contact. A contact this agent already handled is skipped. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        displayOptions: {
          show: { resource: ["contact"], operation: [ADD_TO_AGENT] },
        },
      },
      {
        displayName: "Contact ID",
        name: "contactId",
        type: "string",
        required: true,
        default: "",
        description: "The Harmony contact ID",
        displayOptions: { show: { resource: ["contact"], operation: [GET] } },
      },
      sourceKindProperty({
        operations: [ADD_TO_AGENT, UPSERT, UPDATE, GET_BY_EXTERNAL_ID, GET_CALLS],
      }),
      {
        displayName: "External ID",
        name: "externalId",
        type: "string",
        default: "",
        description:
          "The contact's ID in the source system. When empty, a new contact gets its Harmony ID as its external ID.",
        displayOptions: {
          show: { resource: ["contact"], operation: [ADD_TO_AGENT, UPSERT] },
        },
      },
      {
        displayName: "External ID",
        name: "externalId",
        type: "string",
        required: true,
        default: "",
        description: "The contact's ID in the source system",
        displayOptions: {
          show: { resource: ["contact"], operation: [UPDATE, GET_BY_EXTERNAL_ID, GET_CALLS] },
        },
      },
      contactFieldsProperty({
        operations: [ADD_TO_AGENT, UPSERT],
        name: "contactFields",
        displayName: "Contact Fields",
      }),
      contactFieldsProperty({
        operations: [UPDATE],
        name: "updateFields",
        displayName: "Update Fields",
      }),
      customFieldsProperty({ operations: [ADD_TO_AGENT, UPSERT, UPDATE] }),
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        default: false,
        description: "Whether to return all results or only up to a given limit",
        displayOptions: {
          show: { resource: ["contact"], operation: [GET_CALLS] },
        },
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1 },
        default: 50,
        description: "Max number of results to return",
        displayOptions: {
          show: {
            resource: ["contact"],
            operation: [GET_CALLS],
            returnAll: [false],
          },
        },
      },
      {
        displayName: "Call ID",
        name: "callId",
        type: "string",
        required: true,
        default: "",
        description: "The Harmony call ID, such as callId from the Harmony AI Trigger",
        displayOptions: { show: { resource: ["call"] } },
      },
      {
        displayName: "Include Transcript",
        name: "includeTranscript",
        type: "boolean",
        default: false,
        description: "Whether to add the call's utterances to the output as transcript",
        displayOptions: { show: { resource: ["call"], operation: [GET] } },
      },
    ],
  };

  methods = {
    loadOptions: {
      async getVoiceAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        return await listAgentOptions({ context: this });
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const agentWorkflowIds: AgentWorkflowIds = new Map();

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const resource = this.getNodeParameter("resource", itemIndex);
      const operation = this.getNodeParameter("operation", itemIndex);

      const run =
        resource === "call"
          ? getCall({ context: this, itemIndex })
          : runContactOperation({ context: this, operation, itemIndex, agentWorkflowIds });

      const result = this.continueOnFail()
        ? await run.catch((error: unknown) => failureJson({ error }))
        : await run;

      for (const json of Array.isArray(result) ? result : [result]) {
        returnData.push({ json, pairedItem: { item: itemIndex } });
      }
    }

    return [returnData];
  }
}
