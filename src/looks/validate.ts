import schema from './recipe.schema.json' with { type: 'json' };

// A small checker for the JSON-schema keywords recipe.schema.json uses, and no others. Hand-written
// so the app takes no dependency for it. Each message names the field: "$.punch.from: 3 > 2".
interface Schema {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  items?: Schema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  pattern?: string;
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;

// An integer is also a number.
const isType = (v: unknown, t: string) =>
  typeOf(v) === t || (t === 'number' && typeof v === 'number');

function check(s: Schema, v: unknown, path: string, errs: string[]): void {
  if (s.enum && !s.enum.includes(v))
    return void errs.push(`${path}: ${JSON.stringify(v)} is not one of ${s.enum.join(', ')}`);
  const types = s.type === undefined ? [] : [s.type].flat();
  if (types.length > 0 && !types.some((t) => isType(v, t)))
    return void errs.push(`${path}: expected ${types.join(' or ')}, got ${typeOf(v)}`);
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) errs.push(`${path}: ${v} < ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) errs.push(`${path}: ${v} > ${s.maximum}`);
  } else if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${path}: is empty`);
    if (s.pattern && !new RegExp(s.pattern).test(v))
      errs.push(`${path}: ${JSON.stringify(v)} does not match ${s.pattern}`);
  } else if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems)
      errs.push(`${path}: needs at least ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems)
      errs.push(`${path}: allows at most ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(s.items as Schema, x, `${path}[${i}]`, errs));
  } else if (v !== null && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in obj)) errs.push(`${path}.${k}: missing`);
    for (const [k, x] of Object.entries(obj)) {
      const sub = s.properties?.[k];
      if (sub) check(sub, x, `${path}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown field`);
    }
  }
}

/** Every problem found in a recipe, each starting with the field's path; empty when it is valid. */
export function validateRecipe(recipe: unknown): string[] {
  const errs: string[] = [];
  check(schema as Schema, recipe, '$', errs);
  return errs;
}
