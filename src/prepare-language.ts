/**
 * Load grammars and scopeMappings from atom language packages
 */
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);

type ScopeMappings = { [selector: string]: string };

export interface PreparedLanguage {
  /**
   * The tree-sitter grammar
   */
  grammar: any;
  /**
   * Mapping from css selectors to classes,
   * describing which classes should be applied to which syntax nodes.
   *
   * e.g: {"class > identifier": "entity.name.type.class"}
   *
   * @see https://flight-manual.atom.io/hacking-atom/sections/creating-a-grammar/#syntax-highlighting
   */
  scopeMappings?: ScopeMappings;
}

export type PreparedLanguages = Map<string, PreparedLanguage>;

interface TreeSitterSpec {
  scope: string;
  "file-types": string[];
  path: string;
  highlights: string[];
  locals: string[];
  injections: string;
  "injection-regex"?: string;
  "content-regex"?: string;
}

/**
 * Load the grammar and scope mappings from an APM (atom) package like "language-javascript"
 * @param packageName
 */
export async function loadLanguagesFromPackage(
  packageName: string
): Promise<PreparedLanguages> {
  const langs = new Map<string, PreparedLanguage>();

  // Determine the location of the language package
  const lookup_paths = module.paths;
  // Add the lookup paths of the main module too
  // Required for when package symlinks are used
  // (add these to the start though so they are used first)
  if (require.main) {
    for (let i = require.main.paths.length - 1; i >= 0; i--) {
      const path = require.main.paths[i];
      if (lookup_paths.indexOf(path) === -1) lookup_paths.unshift(path);
    }
  }
  let packageDir: string | null = null;
  for (const lookup of lookup_paths) {
    const p = path.join(lookup, packageName);
    if (await exists(p)) {
      packageDir = p;
      break;
    }
  }
  if (!packageDir) throw new Error(`could not find package: ${packageName}`);

  // Get list of grammars
  const grammarsPackage = path.join(packageDir, "package.json");

  const specs = await readFile(grammarsPackage, "utf8")
    .then((data) => JSON.parse(data))
    .then((data) => {
      if (data["tree-sitter"]) {
        return data["tree-sitter"] as TreeSitterSpec[];
      } else {
        return Promise.reject();
      }
    })
    .catch(() =>
      Promise.reject(
        new Error(`Package ${packageName} is not a valid language package`)
      )
    );

  for (const spec of specs) {
    const grammarPath = require.resolve(spec.path, {
      paths: lookup_paths,
    });
    const grammar = require(grammarPath);
    spec["file-types"].forEach(lang => {
      langs.set(lang, {
        grammar,
        // it should be  "highlights": "queries/highlights.scm"
        // scopeMappings: spec.scope,
      });
    });

  }

  return langs;
}
