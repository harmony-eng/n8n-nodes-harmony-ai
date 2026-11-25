import type { IDataObject, IExecuteFunctions, INodeProperties } from "n8n-workflow";

import { HARMONY_SOURCE_KINDS } from "./harmony-api.constants.ts";
import type { ContactFields, ContactSourceKind, CustomFieldEntry } from "./harmony-api.types.ts";

export function sourceKindProperty({ operations }: { operations: string[] }): INodeProperties {
  return {
    displayName: "Source Kind",
    name: "sourceKind",
    type: "options",
    options: [...HARMONY_SOURCE_KINDS],
    default: "api",
    description: "The system the contact comes from. With External ID, it identifies the contact.",
    displayOptions: { show: { resource: ["contact"], operation: operations } },
  };
}

export function contactFieldsProperty({
  operations,
  name,
  displayName,
}: {
  operations: string[];
  name: string;
  displayName: string;
}): INodeProperties {
  return {
    displayName,
    name,
    type: "collection",
    placeholder: "Add Field",
    default: {},
    displayOptions: { show: { resource: ["contact"], operation: operations } },
    options: [
      {
        displayName: "First Name",
        name: "firstName",
        type: "string",
        default: "",
      },
      {
        displayName: "Full Name",
        name: "fullName",
        type: "string",
        default: "",
        description: "Sent alone, Harmony splits it into first and last name",
      },
      {
        displayName: "Language",
        name: "language",
        type: "string",
        default: "",
        placeholder: "en-US",
        description: "The language the contact speaks, such as en-US or he-IL",
      },
      {
        displayName: "Last Name",
        name: "lastName",
        type: "string",
        default: "",
      },
      {
        displayName: "Location",
        name: "location",
        type: "string",
        default: "",
        placeholder: "US-CA",
        description: "The country or state the contact is in, as an ISO 3166 code or a name",
      },
      {
        displayName: "Phone",
        name: "phone",
        type: "string",
        default: "",
        placeholder: "+12125550199",
        description: "The phone number Harmony calls, with the country code",
      },
      {
        displayName: "Priority",
        name: "priority",
        type: "number",
        default: 0,
        description: "Higher-priority contacts are called first",
      },
      {
        displayName: "Time Zone",
        name: "timezone",
        type: "string",
        default: "",
        placeholder: "America/New_York",
        description:
          "An IANA time zone. When empty, Harmony infers it as the account's settings allow.",
      },
    ],
  };
}

export function customFieldsProperty({ operations }: { operations: string[] }): INodeProperties {
  return {
    displayName: "Custom Fields",
    name: "customFields",
    type: "fixedCollection",
    placeholder: "Add Custom Field",
    typeOptions: { multipleValues: true },
    default: {},
    description: "Fields your agent reads by key. A key sent with an empty value is removed.",
    displayOptions: { show: { resource: ["contact"], operation: operations } },
    options: [
      {
        displayName: "Field",
        name: "field",
        values: [
          { displayName: "Key", name: "key", type: "string", default: "" },
          { displayName: "Value", name: "value", type: "string", default: "" },
        ],
      },
    ],
  };
}

export function readContactFields({
  context,
  itemIndex,
  fieldsParameter,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
  fieldsParameter: string;
}): ContactFields {
  const fields = context.getNodeParameter(fieldsParameter, itemIndex, {}) as IDataObject;

  const customFieldEntries = (
    context.getNodeParameter("customFields.field", itemIndex, []) as CustomFieldEntry[]
  ).filter((entry) => entry.key !== "");

  return {
    ...fields,
    ...(customFieldEntries.length > 0
      ? {
          customFields: Object.fromEntries(
            customFieldEntries.map((entry) => [entry.key, entry.value === "" ? null : entry.value]),
          ),
        }
      : {}),
  };
}

export function readSourceKind({
  context,
  itemIndex,
}: {
  context: IExecuteFunctions;
  itemIndex: number;
}): ContactSourceKind {
  return context.getNodeParameter("sourceKind", itemIndex) as ContactSourceKind;
}
