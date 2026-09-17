import { readFile } from "node:fs/promises";

import { parse, type Expression, type TableConstructorExpression } from "luaparse";

import { collectorSavedVariablesSchema, type CollectorSavedVariables } from "./collector-schema.js";

const ROOT_VARIABLE = "WOW_TRADER_SAVED";

export async function readCollectorSavedVariables(
  filePath: string,
): Promise<CollectorSavedVariables> {
  return parseCollectorSavedVariables(await readFile(filePath, "utf8"));
}

export function parseCollectorSavedVariables(source: string): CollectorSavedVariables {
  const chunk = parse(source, {
    comments: false,
    encodingMode: "x-user-defined",
    luaVersion: "5.1",
  });

  for (const statement of chunk.body) {
    if (statement.type !== "AssignmentStatement") continue;
    const variableIndex = statement.variables.findIndex(
      (variable) => variable.type === "Identifier" && variable.name === ROOT_VARIABLE,
    );
    if (variableIndex === -1) continue;
    const expression = statement.init[variableIndex];
    if (!expression) throw new Error(`${ROOT_VARIABLE} has no assigned value`);
    return collectorSavedVariablesSchema.parse(decodeLiteral(expression));
  }
  throw new Error(`${ROOT_VARIABLE} was not found in the SavedVariables file`);
}

function decodeLiteral(expression: Expression): unknown {
  switch (expression.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return expression.value;
    case "NilLiteral":
      return null;
    case "UnaryExpression":
      if (expression.operator === "-" && expression.argument.type === "NumericLiteral") {
        return -expression.argument.value;
      }
      break;
    case "TableConstructorExpression":
      return decodeTable(expression);
  }
  throw new Error(`Unsupported Lua expression in SavedVariables: ${expression.type}`);
}

function decodeTable(expression: TableConstructorExpression): unknown {
  const stringEntries = new Map<string, unknown>();
  const numericEntries = new Map<number, unknown>();
  let implicitIndex = 1;

  for (const field of expression.fields) {
    if (field.type === "TableValue") {
      while (numericEntries.has(implicitIndex)) implicitIndex += 1;
      numericEntries.set(implicitIndex, decodeLiteral(field.value));
      implicitIndex += 1;
      continue;
    }
    if (field.type === "TableKeyString") {
      stringEntries.set(field.key.name, decodeLiteral(field.value));
      continue;
    }
    const key = decodeLiteral(field.key);
    if (typeof key === "string") stringEntries.set(key, decodeLiteral(field.value));
    else if (typeof key === "number" && Number.isSafeInteger(key) && key >= 1) {
      numericEntries.set(key, decodeLiteral(field.value));
    } else throw new Error("SavedVariables table keys must be strings or positive integers");
  }

  if (stringEntries.size > 0 && numericEntries.size > 0) {
    throw new Error("Mixed keyed and array-style SavedVariables tables are not supported");
  }
  if (stringEntries.size > 0) return Object.fromEntries(stringEntries);
  if (numericEntries.size === 0) return [];
  const maximumIndex = Math.max(...numericEntries.keys());
  const result: unknown[] = [];
  for (let index = 1; index <= maximumIndex; index += 1) {
    if (!numericEntries.has(index))
      throw new Error(`SavedVariables array has a gap at index ${index}`);
    result.push(numericEntries.get(index));
  }
  return result;
}
