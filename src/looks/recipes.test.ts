import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEGACY_LOOKS } from './legacy-looks.fixture';
import { parseRecipes } from './load';
import { LOOKS, LOOK_ORDER } from './looks';
import type { Look } from './types';
import { validateRecipe } from './validate';

const recipeFiles = import.meta.glob<unknown>('./recipes/*.json', {
  eager: true,
  import: 'default',
});
const flash = structuredClone(recipeFiles['./recipes/flash-cut.json']) as Look & { schema: string };

const STRUCTURE = {
  hook: { unit: 'seconds', length: 3, beatsPerPhoto: 1, bestPhoto: true },
  beats: [
    { name: 'build', beatsPerPhoto: 2, photos: 4 },
    { name: 'tail', beatsPerPhoto: 1 },
  ],
  payoff: { beatsPerPhoto: 4, bestPhoto: true },
  textSlots: [],
};

describe('recipe files', () => {
  it('has one file per look in the chip order, and no others', () => {
    expect(Object.keys(recipeFiles).sort()).toEqual(
      LOOK_ORDER.map((id) => `./recipes/${id}.json`).sort(),
    );
  });

  it.each(LOOK_ORDER)('%s says exactly what the TypeScript look said before', (id) => {
    expect(LOOKS[id]).toEqual(LEGACY_LOOKS[id]);
  });

  it('every file passes the schema', () => {
    for (const json of Object.values(recipeFiles)) expect(validateRecipe(json)).toEqual([]);
  });

  it('is valid with a structure section, and the same without one', () => {
    expect(validateRecipe({ ...flash, structure: STRUCTURE })).toEqual([]);
    expect(validateRecipe(flash)).toEqual([]);
  });
});

describe('validateRecipe', () => {
  it('names the field for a wrong type, a range, a missing and an unknown field', () => {
    const bad: Record<string, unknown> = {
      ...flash,
      punch: { ...flash.punch, from: 3, frames: 'six' },
      colour: 'red',
      grain: 2,
    };
    delete bad.vignette;
    expect(validateRecipe(bad)).toEqual(
      expect.arrayContaining([
        '$.punch.from: 3 > 2',
        '$.punch.frames: expected integer, got string',
        '$.colour: unknown field',
        '$.grain: 2 > 1',
        '$.vignette: missing',
      ]),
    );
  });

  it('refuses text in the structure, a bad enum, a bad colour and a bad pair of cut lengths', () => {
    const text = {
      ...STRUCTURE,
      textSlots: [{ id: 'title' }],
      hook: { ...STRUCTURE.hook, unit: 'days' },
    };
    expect(validateRecipe({ ...flash, structure: text })).toEqual(
      expect.arrayContaining([
        '$.structure.textSlots: allows at most 0 items',
        '$.structure.hook.unit: "days" is not one of seconds, beats',
      ]),
    );
    const grade = [{ op: 'multiply', color: 'teal', alpha: 0.1 }];
    expect(validateRecipe({ ...flash, grade })[0]).toMatch(
      /^\$\.grade\[0\]\.color: "teal" does not match/,
    );
    expect(validateRecipe({ ...flash, planning: { ...flash.planning, cutBeats: [1] } })).toEqual([
      '$.planning.cutBeats: needs at least 2 items',
    ]);
  });

  it('is the same file the app ships', () => {
    expect(JSON.parse(readFileSync('src/looks/recipe.schema.json', 'utf8')).$id).toBe(
      'reel-recipe/1',
    );
  });
});

describe('parseRecipes', () => {
  it('names the file and the field when a recipe is wrong', () => {
    const files = { './recipes/flash-cut.json': { ...flash, flash: { peak: 4, frames: 4 } } };
    expect(() => parseRecipes(files)).toThrow(
      'Recipe ./recipes/flash-cut.json: $.flash.peak: 4 > 1',
    );
  });

  it('refuses an id that does not match the file name, and two effect modules in one look', () => {
    expect(() => parseRecipes({ './recipes/other.json': flash })).toThrow(
      /must match the file name "other"/,
    );
    const both = {
      ...flash,
      glitch: { strips: 4, peak: 0.1, frames: 5, share: 0.5, chroma: 0.2 },
      zoomThrough: { inner: 0.5, minScale: 0.1, border: 0 },
    };
    expect(() => parseRecipes({ './recipes/flash-cut.json': both })).toThrow(/at most one of/);
  });

  it('keeps the structure and drops the schema tag', () => {
    const looks = parseRecipes({ './recipes/flash-cut.json': { ...flash, structure: STRUCTURE } });
    expect(looks['flash-cut']?.structure).toEqual(STRUCTURE);
    expect(looks['flash-cut']).not.toHaveProperty('schema');
  });
});
