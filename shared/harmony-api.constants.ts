export const HARMONY_CREDENTIAL_NAME = "harmonyAiApi";

export const HARMONY_PACKAGE_VERSION = "0.1.0";

export const HARMONY_USER_AGENT = `harmony-n8n/${HARMONY_PACKAGE_VERSION}`;

export const HARMONY_REGION_BASE_URLS = {
  us: "https://api.harmony.ai",
  eu: "https://api.eu.harmony.ai",
} as const;

export const HARMONY_SOURCE_KINDS = [
  { name: "API", value: "api" },
  { name: "CSV", value: "csv" },
  { name: "HubSpot", value: "hubspot" },
  { name: "Inbound", value: "inbound" },
  { name: "Manual", value: "manual" },
  { name: "Monday.com", value: "monday" },
  { name: "Salesforce", value: "salesforce" },
] as const;

export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;
