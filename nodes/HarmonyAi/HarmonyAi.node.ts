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
  BulkUpsertContactsBody,
  BulkUpsertContactsResult,
  ContactCallsPage,
  UpsertContactBody,
} from "../../shared/harmony-api.types.ts";
import {
  failureJson,
  harmonyApiRequest,
  listAgentWorkflowOptions,
} from "../../shared/harmony-api.util.ts";

const ADD_TO_WORKFLOW = "addToWorkflow";
const UPSERT = "upsert";
const UPDATE = "updateByExternalId";
const GET = "get";
const GET_BY_EXTERNAL_ID = "getByExternalId";
const GET_CALLS = "getCalls";
const GET_TRANSCRIPT = "getTranscript";
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

async function runCallOperation({
  context,
  operation,
  itemIndex,
}: {
  context: IExecuteFunctions;
  operation: string;
  itemIndex: number;
}): Promise<IDataObject> {
  const callId = encodeURIComponent(context.getNodeParameter("callId", itemIndex) as string);

  const path =
    operation === GET_TRANSCRIPT ? `/api/v1/calls/${callId}/transcript` : `/api/v1/calls/${callId}`;

  return await harmonyApiRequest<IDataObject>({
    context,
    itemIndex,
    request: { method: "GET", path },
  });
}

async function addToWorkflow({
  context,
  itemIndex,
  contact,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
  contact: UpsertContactBody;
}): Promise<IDataObject> {
  const workflowId = context.getNodeParameter("workflowId", itemIndex) as string;

  const body: BulkUpsertContactsBody = {
    assignmentOptions: { workflowId },
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
    workflowId,
    sourceKind: contact.sourceKind,
    externalId: contact.externalId,
  };
}

async function runContactOperation({
  context,
  operation,
  itemIndex,
}: {
  context: IExecuteFunctions;
  operation: string;
  itemIndex: number;
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

  return await addToWorkflow({ context, itemIndex, contact });
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
            name: "Add to Workflow",
            value: ADD_TO_WORKFLOW,
            action: "Add a contact to a workflow",
            description:
              "Create or update a contact and enroll it in a workflow. Harmony calls it on the workflow's schedule.",
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
        default: ADD_TO_WORKFLOW,
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["call"] } },
        options: [
          { name: "Get", value: GET, action: "Get a call" },
          {
            name: "Get Transcript",
            value: GET_TRANSCRIPT,
            action: "Get a call transcript",
          },
        ],
        default: GET,
      },
      {
        displayName: "Workflow Name or ID",
        name: "workflowId",
        type: "options",
        typeOptions: { loadOptionsMethod: "getWorkflows" },
        required: true,
        default: "",
        description:
          'The workflow to enroll the contact in. A contact that already ran it is skipped. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        displayOptions: {
          show: { resource: ["contact"], operation: [ADD_TO_WORKFLOW] },
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
        operations: [ADD_TO_WORKFLOW, UPSERT, UPDATE, GET_BY_EXTERNAL_ID, GET_CALLS],
      }),
      {
        displayName: "External ID",
        name: "externalId",
        type: "string",
        default: "",
        description:
          "The contact's ID in the source system. When empty, a new contact gets its Harmony ID as its external ID.",
        displayOptions: {
          show: { resource: ["contact"], operation: [ADD_TO_WORKFLOW, UPSERT] },
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
        operations: [ADD_TO_WORKFLOW, UPSERT],
        name: "contactFields",
        displayName: "Contact Fields",
      }),
      contactFieldsProperty({
        operations: [UPDATE],
        name: "updateFields",
        displayName: "Update Fields",
      }),
      customFieldsProperty({ operations: [ADD_TO_WORKFLOW, UPSERT, UPDATE] }),
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
    ],
  };

  methods = {
    loadOptions: {
      async getWorkflows(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        return await listAgentWorkflowOptions({
          context: this,
          valueField: "id",
        });
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const resource = this.getNodeParameter("resource", itemIndex);
      const operation = this.getNodeParameter("operation", itemIndex);

      const run =
        resource === "call"
          ? runCallOperation({ context: this, operation, itemIndex })
          : runContactOperation({ context: this, operation, itemIndex });

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
