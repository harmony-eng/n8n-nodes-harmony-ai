import {
  NodeApiError,
  type IDataObject,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  type JsonObject,
} from "n8n-workflow";

import { HARMONY_CREDENTIAL_NAME, HARMONY_USER_AGENT } from "./harmony-api.constants.ts";
import type { HarmonyContext, HarmonyRequest, WorkflowPage } from "./harmony-api.types.ts";

const WORKFLOW_PAGE_LIMIT = 100;

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

export async function listAgentWorkflowOptions({
  context,
  valueField,
}: {
  context: ILoadOptionsFunctions;
  valueField: "id" | "parentRefId";
}): Promise<INodePropertyOptions[]> {
  const options: INodePropertyOptions[] = [];
  let nextToken: string | undefined;
  do {
    const page = await harmonyApiRequest<WorkflowPage>({
      context,
      request: {
        method: "GET",
        path: "/api/v1/workflows",
        qs: { limit: WORKFLOW_PAGE_LIMIT, ...(nextToken ? { nextToken } : {}) },
      },
    });

    for (const workflow of page.data) {
      const value = workflow[valueField];
      if (
        workflow.status !== "archived" &&
        value &&
        !options.some((option) => option.value === value)
      ) {
        options.push({
          name: workflow.name,
          value,
          description: workflow.status,
        });
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);

  return options.sort((first, second) => first.name.localeCompare(second.name));
}

export function failureJson({ error }: { error: unknown }): IDataObject {
  return { error: error instanceof Error ? error.message : String(error) };
}
