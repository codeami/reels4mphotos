import type { Look } from './types';
import { validateRecipe } from './validate';

export const RECIPE_SCHEMA = 'reel-recipe/1';

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.json$/, '');

// The effect modules are alternatives: a look is drawn by at most one of them.
const EFFECTS = ['edgePulse', 'zoomThrough', 'glitch'] as const;

/**
 * Recipe files (path to parsed JSON) become looks, keyed by id. A bad recipe stops the app at
 * start with the file and the field in the message, never a half-working look.
 */
export function parseRecipes(files: Record<string, unknown>): Record<string, Look> {
  const looks: Record<string, Look> = {};
  for (const [path, json] of Object.entries(files)) {
    const problems = validateRecipe(json);
    const recipe = json as Look & { schema?: string };
    if (problems.length === 0 && recipe.id !== nameOf(path))
      problems.push(
        `$.id: ${JSON.stringify(recipe.id)} must match the file name "${nameOf(path)}"`,
      );
    const range = recipe.planning?.cutBeats;
    if (problems.length === 0 && range && range[0] > range[1])
      problems.push('$.planning.cutBeats: the first number is larger than the second');
    if (problems.length === 0 && EFFECTS.filter((k) => recipe[k]).length > 1)
      problems.push(`$: at most one of ${EFFECTS.join(', ')}`);
    if (problems.length > 0) throw new Error(`Recipe ${path}: ${problems.join('; ')}`);
    // The tag has done its job once the schema check passes; a look does not carry it.
    const look = { ...recipe };
    delete look.schema;
    looks[look.id] = look;
  }
  return looks;
}
