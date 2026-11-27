import {
  NodeApiError,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  type JsonObject,
} from "n8n-workflow";

import { HARMONY_CREDENTIAL_NAME, HARMONY_USER_AGENT } from "./harmony-api.constants.ts";
import type {
  AgentWorkflow,
  HarmonyContext,
  HarmonyRequest,
  WorkflowPage,
} from "./harmony-api.types.ts";

const WORKFLOW_PAGE_LIMIT = 100;
const AGENT_WORKFLOW_NAME_SUFFIX = /\s+workflow$/i;

export async function harmonyApiRequest<T>({
  context,
  request,
  itemIndex,
}: {
  context: HarmonyContext;
  request: HarmonyRequest;
  itemIndex?: number;
}): Promise<T> {
  try {
    const response = (await context.helpers.httpRequestWithAuthentication.call(
      context,
      HARMONY_CREDENTIAL_NAME,
      {
        method: request.method,
        url: request.path,
        body: request.body,
        qs: request.qs,
        json: true,
        headers: { "User-Agent": HARMONY_USER_AGENT },
      },
    )) as T;

    return response;
  } catch (error) {
    throw new NodeApiError(context.getNode(), error as JsonObject, {
      itemIndex,
    });
  }
}

async function listAgentWorkflows({
  context,
  itemIndex,
}: {
  context: HarmonyContext;
  itemIndex?: number;
}): Promise<AgentWorkflow[]> {
  const workflows: AgentWorkflow[] = [];
  let nextToken: string | undefined;
  do {
    const page = await harmonyApiRequest<WorkflowPage>({
      context,
      itemIndex,
      request: {
        method: "GET",
        path: "/api/v1/workflows",
        qs: { limit: WORKFLOW_PAGE_LIMIT, ...(nextToken ? { nextToken } : {}) },
      },
    });

    for (const workflow of page.data) {
      if (workflow.status !== "archived" && workflow.parentRefId) {
        workflows.push({ ...workflow, parentRefId: workflow.parentRefId });
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);

  return workflows;
}

export async function listAgentOptions({
  context,
}: {
  context: ILoadOptionsFunctions;
}): Promise<INodePropertyOptions[]> {
  const options: INodePropertyOptions[] = [];
  for (const workflow of await listAgentWorkflows({ context })) {
    if (!options.some((option) => option.value === workflow.parentRefId)) {
      options.push({
        name: workflow.name.replace(AGENT_WORKFLOW_NAME_SUFFIX, ""),
        value: workflow.parentRefId,
        description: workflow.status,
      });
    }
  }

  return options.sort((first, second) => first.name.localeCompare(second.name));
}

export async function findAgentWorkflowId({
  context,
  itemIndex,
  agentId,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
  agentId: string;
}): Promise<string> {
  const workflows = (await listAgentWorkflows({ context, itemIndex })).filter(
    (workflow) => workflow.parentRefId === agentId,
  );

  const workflow = workflows.find((candidate) => candidate.status === "published") ?? workflows[0];

  if (!workflow) {
    throw new NodeOperationError(context.getNode(), `Harmony has no agent with ID ${agentId}`, {
      itemIndex,
    });
  }

  return workflow.id;
}

export function failureJson({ error }: { error: unknown }): IDataObject {
  return { error: error instanceof Error ? error.message : String(error) };
}
