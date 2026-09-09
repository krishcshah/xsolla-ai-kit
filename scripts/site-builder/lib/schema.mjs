/**
 * A small JSON Schema validator, sized to exactly the keywords the generated
 * tool schemas use: type, properties, required, items, enum, minLength,
 * maxLength, minimum, maximum, pattern, format (uri), additionalProperties,
 * propertyNames, anyOf.
 *
 * Why hand-rolled: the MCP server validated tool input with Zod in dispatch, so
 * no handler ever saw malformed input. Zod is not available here (this repo ships
 * no dependencies), but the guarantee is worth keeping — drop it and every
 * command inherits a precondition it does not enforce.
 *
 * Error text matches the server's flat shape:
 *   Invalid arguments for "update_block": values (expected object, got string)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

let cachedSchemas = null;

export function loadSchemas() {
  if (!cachedSchemas) {
    cachedSchemas = JSON.parse(readFileSync(join(HERE, 'schemas.json'), 'utf8'));
  }
  return cachedSchemas;
}

export function getSchema(toolName) {
  return loadSchemas()[toolName] || null;
}

/** @returns {{ok: true, value: object} | {ok: false, errors: string[]}} */
export function validate(schema, value) {
  const errors = [];
  check(schema, value, '', errors);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function formatToolInputError(toolName, errors) {
  return `Invalid arguments for "${toolName}": ${errors.join('; ')}`;
}

function check(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (Array.isArray(schema.anyOf)) {
    const anyOk = schema.anyOf.some((sub) => {
      const sub_errors = [];
      check(sub, value, path, sub_errors);
      return sub_errors.length === 0;
    });
    if (!anyOk) {
      errors.push(`${label(path)} does not match any allowed shape`);
      return;
    }
  }

  if (schema.type !== undefined && !typeMatches(schema.type, value)) {
    errors.push(`${label(path)} (expected ${asList(schema.type)}, got ${typeOf(value)})`);
    return; // further keywords assume the type held
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${label(path)} must be one of: ${schema.enum.join(', ')} (got ${JSON.stringify(value)})`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(
        schema.minLength === 1
          ? `${label(path)} must not be empty`
          : `${label(path)} must be at least ${schema.minLength} characters (got ${value.length})`
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${label(path)} must be at most ${schema.maxLength} characters (got ${value.length})`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${label(path)} must match ${schema.pattern} (got ${JSON.stringify(value)})`);
    }
    if (schema.format === 'uri' && !isUri(value)) {
      errors.push(`${label(path)} must be a URL (got ${JSON.stringify(value)})`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${label(path)} must be >= ${schema.minimum} (got ${value})`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${label(path)} must be <= ${schema.maximum} (got ${value})`);
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
  }

  if (isPlainObject(value)) {
    for (const key of schema.required || []) {
      if (value[key] === undefined) {
        errors.push(`${label(join_(path, key))} is required`);
      }
    }
    const props = schema.properties || {};
    for (const [key, val] of Object.entries(value)) {
      if (props[key]) {
        check(props[key], val, join_(path, key), errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${label(join_(path, key))} is not a recognised field`);
      } else if (isPlainObject(schema.additionalProperties)) {
        check(schema.additionalProperties, val, join_(path, key), errors);
      }
      if (schema.propertyNames) {
        check(schema.propertyNames, key, join_(path, key), errors);
      }
    }
  }
}

/** Fill in `default` values the schema declares, matching what Zod did on parse. */
export function applyDefaults(schema, value) {
  if (!schema || !isPlainObject(value)) return value;
  const out = { ...value };
  for (const [key, sub] of Object.entries(schema.properties || {})) {
    if (out[key] === undefined && sub && sub.default !== undefined) {
      out[key] = sub.default;
    } else if (isPlainObject(out[key]) && sub && sub.properties) {
      out[key] = applyDefaults(sub, out[key]);
    }
  }
  return out;
}

function typeMatches(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    switch (t) {
      case 'object':
        return isPlainObject(value);
      case 'array':
        return Array.isArray(value);
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return true;
    }
  });
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value === undefined) return 'nothing';
  return typeof value;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isUri(v) {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function asList(type) {
  return Array.isArray(type) ? type.join(' or ') : type;
}

function label(path) {
  return path || '(root)';
}

function join_(path, key) {
  return path ? `${path}.${key}` : key;
}
