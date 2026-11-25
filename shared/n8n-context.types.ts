import type { IHttpRequestOptions } from "n8n-workflow";

export interface RecordedRequest {
  credentialsType: string;
  options: IHttpRequestOptions;
}

export interface RecordedResponse {
  status?: number;
  body?: unknown;
}
