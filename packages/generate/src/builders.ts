import { promises as fs } from "node:fs";
import path from "node:path";
import { systemUtils } from "gel";
import { StrictMap } from "gel/dist/reflection/strictMap";
import * as genutil from "./genutil";
import { importExportHelpers } from "./importExportHelpers";

const { exists, readFileUtf8 } = systemUtils;
type Mode = "ts" | "js" | "dts";
type ModuleKind = "esm" | "cjs";

export interface IdentRef {
  type: "identRef";
  name: string;
  opts?: { prefix?: string };
}

export type CodeFragment = string | IdentRef;

export interface Frag {
  type: "frag";
  modes: Set<Mode>;
  content: CodeFragment[];
}

export const f =
  (...modes: Mode[]) =>
  (
    strings: TemplateStringsArray,
    ...exprs: (CodeFragment | CodeFragment[])[]
  ): Frag => {
    return {
      type: "frag",
      modes: new Set(modes),
      content: genutil.frag(strings, ...exprs),
    };
  };

export const ts = f("ts");
export const js = f("js");
export const dts = f("dts");
export const r = f("ts", "js");
export const all = f("ts", "js", "dts");
export const t = f("ts", "dts");

type AnyCodeFrag = CodeFragment | Frag;

export class CodeBuffer {
  private buf: AnyCodeFrag[][] = [];
  private indent = 0;

  getBuf() {
    return this.buf;
  }

  nl(): void {
    this.buf.push(["\n"]);
  }

  indented(nested: () => void): void {
    this.indent++;
    try {
      nested();
    } finally {
      this.indent--;
    }
  }

  increaseIndent(): void {
    this.indent++;
  }

  decreaseIndent(): void {
    this.indent--;
  }

  writeln(...lines: AnyCodeFrag[][]): void {
    const indent = "  ".repeat(this.indent);
    const indentFrag = (frag: AnyCodeFrag): AnyCodeFrag =>
      typeof frag === "string"
        ? frag.replace(/\n(?!$)/g, "\n" + indent)
        : ((frag.type === "frag"
            ? { ...frag, content: frag.content.map(indentFrag) }
            : frag) as any);

    lines.forEach((line) => {
      this.buf.push([indent, ...line.map(indentFrag)]);
    });
  }

  writeBuf(buf: CodeBuffer) {
    this.writeln(...buf.getBuf());
  }

  isEmpty(): boolean {
    return !this.buf.length;
  }
}

type Import = {
  fromPath: string;
  modes: Set<Mode>;
  allowFileExt: boolean;
  typeOnly: boolean;
} & (
  | { type: "default"; name: string }
  | { type: "star"; name: string }
  | { type: "partial"; names: { [key: string]: string | boolean } }
);

type Export = { modes: Set<Mode> } & (
  | {
      type: "named";
      name: string | IdentRef | (string | IdentRef)[];
      as?: string;
      isDefault: boolean;
      typeOnly: boolean;
    }
  | { type: "refsDefault"; ref: IdentRef | string; as: string }
  | {
      type: "from";
      names: { [key: string]: string | boolean };
      fromPath: string;
      allowFileExt?: boolean;
      typeOnly: boolean;
    }
  | {
      type: "starFrom";
      name: string | null;
      fromPath: string;
      allowFileExt?: boolean;
    }
);

type ImportParams = {
  allowFileExt?: boolean;
  modes?: Mode[];
  typeOnly?: boolean;
};
type ExportParams = { modes?: Mode[] };

const allModes = new Set<Mode>(["dts", "js", "ts"]);
class BuilderImportsExports {
  constructor(
    public imports: Set<Import> = new Set<Import>(),
    public exports: Set<Export> = new Set<Export>(),
  ) {}

  addImport(
    names: { [key: string]: string | boolean },
    fromPath: string,
    params: ImportParams = {},
  ) {
    this.imports.add({
      type: "partial",
      fromPath,
      names,
      allowFileExt: params.allowFileExt ?? false,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: params.typeOnly ?? false,
    });
  }

  addImportDefault(name: string, fromPath: string, params: ImportParams = {}) {
    this.imports.add({
      type: "default",
      fromPath,
      name,
      allowFileExt: params.allowFileExt ?? false,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: params.typeOnly ?? false,
    });
  }

  addImportStar(name: string, fromPath: string, params: ImportParams = {}) {
    this.imports.add({
      type: "star",
      fromPath,
      name,
      allowFileExt: params.allowFileExt ?? false,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: params.typeOnly ?? false,
    });
  }

  addExport(
    name: string | IdentRef | (string | IdentRef)[],
    // as?: string,
    // isDefault: boolean = false,
    params: ExportParams & { as?: string; typeOnly?: boolean } = {},
  ) {
    this.exports.add({
      type: "named",
      name,
      as: params.as,
      isDefault: false,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: params.typeOnly ?? false,
    });
  }

  addExportDefault(
    name: string | IdentRef | (string | IdentRef)[],
    params: ExportParams = {},
  ) {
    this.exports.add({
      type: "named",
      name,
      isDefault: true,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: false,
    });
  }

  addToDefaultExport(ref: IdentRef | string, as: string) {
    this.exports.add({
      type: "refsDefault",
      ref,
      as,
      modes: allModes,
    });
  }

  addExportFrom(
    names: { [key: string]: string | boolean },
    fromPath: string,
    params: ImportParams = {},
  ) {
    this.exports.add({
      type: "from",
      names,
      fromPath,
      allowFileExt: params.allowFileExt ?? false,
      modes: params.modes ? new Set(params.modes) : allModes,
      typeOnly: params.typeOnly ?? false,
    });
  }

  addExportStar(
    fromPath: string,
    params: Omit<ImportParams, "typeOnly"> & { as?: string } = {},
  ) {
    this.exports.add({
      type: "starFrom",
      name: params.as || null,
      fromPath,
      allowFileExt: params.allowFileExt ?? false,
      modes: params.modes ? new Set(params.modes) : allModes,
    });
  }

  renderImports({
    mode,
    moduleKind,
    helpers,
    extension,
  }: {
    mode: Mode;
    moduleKind: ModuleKind;
    helpers: Set<keyof typeof importExportHelpers>;
    extension?: string;
  }) {
    const imports = new Set<string>();
    for (const imp of this.imports) {
      if (imp.modes && !imp.modes.has(mode)) continue;
      if (imp.typeOnly && mode === "js") continue;

      const ext = imp.fromPath.startsWith(".") ? extension : "";

      switch (imp.type) {
        case "default":
          if (moduleKind === "cjs") helpers.add("importDefault");
          imports.add(
            moduleKind === "esm"
              ? `import${imp.typeOnly ? " type" : ""} ${imp.name} from "${
                  imp.fromPath
                }${ext}";`
              : `const ${imp.name} = __importDefault(
                require("${imp.fromPath}")).default;`,
          );
          break;
        case "star":
          if (moduleKind === "cjs") {
            helpers
              .add("createBinding")
              .add("setModuleDefault")
              .add("importStar");
          }
          imports.add(
            moduleKind === "esm"
              ? `import${imp.typeOnly ? " type" : ""} * as ${imp.name} from "${
                  imp.fromPath
                }${ext}";`
              : `const ${imp.name} = __importStar(require("${imp.fromPath}"));`,
          );
          break;
        case "partial": {
          const names = Object.entries(imp.names)
            .map(([key, val]) => {
              if (typeof val === "boolean" && !val) return null;
              return (
                key +
                (typeof val === "string"
                  ? `${moduleKind === "esm" ? " as" : ":"} ${val}`
                  : "")
              );
            })
            .filter((val) => val !== null)
            .join(", ");
          imports.add(
            moduleKind === "esm"
              ? `import${imp.typeOnly ? " type" : ""} { ${names} } from "${
                  imp.fromPath
                }${ext}";`
              : `const { ${names} } = require("${imp.fromPath}");`,
          );
          break;
        }
      }
    }

    return [...imports].join("\n");
  }

  renderExports({
    mode,
    moduleKind,
    refs,
    helpers,
    extension,
    forceDefaultExport = false,
  }: {
    mode: Mode;
    moduleKind: ModuleKind;
    refs: Map<string, { internalName: string; dir: string }>;
    helpers: Set<keyof typeof importExportHelpers>;
    forceDefaultExport?: boolean;
    extension: string;
  }) {
    const exports: string[] = [];
    const exportsFrom: string[] = [];
    const exportList: string[] = [];
    const exportTypes: string[] = [];
    const refsDefault: { ref: string; as: string }[] = [];

    let hasDefaultExport = false;
    for (const exp of this.exports) {
      if (exp.modes && !exp.modes.has(mode)) {
        continue;
      }
      switch (exp.type) {
        case "named": {
          let name = "";
          const nameFrags = Array.isArray(exp.name) ? exp.name : [exp.name];
          for (const nameFrag of nameFrags) {
            if (typeof nameFrag === "string") {
              name += nameFrag;
            } else {
              const nameRef = refs.get(nameFrag.name);

              if (!nameRef) {
                throw new Error(`Cannot find ref: ${nameFrag.name}`);
              }

              name += (nameFrag.opts?.prefix ?? "") + nameRef.internalName;
            }
          }

          if (exp.isDefault) {
            if (hasDefaultExport || refsDefault.length) {
              throw new Error("multiple default exports");
            }
            if (moduleKind === "esm") {
              exports.push(`export default ${name};`);
            } else {
              exports.push(`exports.default = ${name}`);
            }
            hasDefaultExport = true;
          } else {
            if (moduleKind === "esm") {
              (exp.typeOnly ? exportTypes : exportList).push(
                `${name}${exp.as != null ? ` as ${exp.as}` : ""}`,
              );
            } else if (!exp.typeOnly) {
              exportList.push(`${exp.as != null ? exp.as : name}: ${name}`);
            }
          }
          break;
        }
        case "from":
          if (moduleKind === "esm") {
            exportsFrom.push(
              `export ${exp.typeOnly ? "type " : ""}{ ${Object.entries(
                exp.names,
              )
                .map(([key, val]) => {
                  if (typeof val === "boolean" && !val) return null;
                  return key + (typeof val === "string" ? `as ${val}` : "");
                })
                .filter((val) => val !== null)
                .join(", ")} } from "${exp.fromPath}${
                // exp.allowFileExt && mode === "js"
                //   ? exp.fromPath.startsWith(".")
                //     ? ".mjs"
                //     : ".js"
                //   : ""
                exp.fromPath.startsWith(".") ? extension : ""
              }";`,
            );
          } else {
            const modName = exp.fromPath.replace(/[^a-z]/gi, "") + "_1";
            exportsFrom.push(
              `(function () {\n  var ${modName} = require("${exp.fromPath}");`,
            );
            for (const [expName, val] of Object.entries(exp.names)) {
              if (typeof val === "boolean" && !val) {
                continue;
              }
              exportsFrom.push(
                `  Object.defineProperty(exports, "${
                  typeof val === "string" ? val : expName
                }", { enumerable: true, get: function () { return ${modName}.${expName}; } });`,
              );
            }
            exportsFrom.push(`})();`);
          }
          break;
        case "starFrom":
          if (moduleKind === "esm") {
            exportsFrom.push(
              `export * ${exp.name !== null ? `as ${exp.name} ` : ""}from "${
                exp.fromPath
              }${
                exp.fromPath.startsWith(".") ? extension : ""
                // exp.allowFileExt && mode === "js"
                //   ? exp.fromPath.startsWith(".")
                //     ? ".mjs"
                //     : ".js"
                //   : ""
              }";`,
            );
          } else {
            if (exp.name !== null) {
              helpers
                .add("createBinding")
                .add("setModuleDefault")
                .add("importStar");
              exportsFrom.push(
                `exports.${exp.name} = __importStar(require("${exp.fromPath}"));`,
              );
            } else {
              helpers.add("createBinding").add("exportStar");
              exportsFrom.push(
                `__exportStar(require("${exp.fromPath}"), exports);`,
              );
            }
          }
          break;
        case "refsDefault":
          if (hasDefaultExport) {
            throw new Error("multiple default exports");
          }

          if (typeof exp.ref === "string") {
            refsDefault.push({
              ref: exp.ref,
              as: exp.as,
            });
          } else {
            const ref = refs.get(exp.ref.name);

            if (!ref) {
              throw new Error(`Cannot find ref: ${exp.ref.name}`);
            }

            refsDefault.push({
              ref: (exp.ref.opts?.prefix ?? "") + ref.internalName,
              as: exp.as,
            });
          }
      }
    }

    if (exportList.length) {
      if (moduleKind === "esm") {
        exports.push(`export { ${exportList.join(", ")} };\n`);
      } else {
        exports.push(`Object.assign(exports, { ${exportList.join(", ")} });\n`);
      }
    }
    if (exportTypes.length && mode !== "js") {
      exports.push(`export type { ${exportTypes.join(", ")} };\n`);
    }
    if (refsDefault.length || forceDefaultExport) {
      const refsByExportAs = [...groupToMapBy(refsDefault, (x) => x.as)].map(
        ([as, group]) => ({
          as,
          refs: group.map(({ ref }) => ref).reverse(),
        }),
      );
      if (mode === "ts" || mode === "dts") {
        exports.push(
          `${
            mode === "dts" ? "declare " : ""
          }type __defaultExports = {\n${refsByExportAs
            .map(({ refs, as }) => {
              const key = genutil.quote(as);
              const value = refs.map((ref) => `typeof ${ref}`).join(" & ");
              return `  ${key}: ${value}`;
            })
            .join(";\n")}\n};`,
        );
      }
      if (mode === "ts" || mode === "js") {
        exports.push(
          `const __defaultExports${
            mode === "ts" ? ": __defaultExports" : ""
          } = {\n${refsByExportAs
            .map(({ refs, as }) => {
              const key = genutil.quote(as);
              const value =
                refs.length === 1
                  ? refs
                  : `Object.freeze({ ${refs
                      .map((ref) => `...${ref}`)
                      .join(", ")} })`;
              return `  ${key}: ${value}`;
            })
            .join(",\n")}\n};`,
        );
      }
      if (mode === "dts") {
        exports.push(`declare const __defaultExports: __defaultExports;`);
      }
      if (moduleKind === "esm") {
        exports.push(`export default __defaultExports;`);
      } else {
        exports.push(`exports.default = __defaultExports;`);
      }
    }
    return { exports: exports.join("\n"), exportsFrom: exportsFrom.join("\n") };
  }

  clone() {
    return new BuilderImportsExports(
      new Set(this.imports),
      new Set(this.exports),
    );
  }
}

export class CodeBuilder {
  private buf = new CodeBuffer();
  private importsExports = new BuilderImportsExports();

  constructor(
    private dirBuilder: DirBuilder,
    private dir: string,
  ) {}

  addImport = this.importsExports.addImport.bind(this.importsExports);
  addImportDefault = this.importsExports.addImportDefault.bind(
    this.importsExports,
  );
  addImportStar = this.importsExports.addImportStar.bind(this.importsExports);

  addExport = this.importsExports.addExport.bind(this.importsExports);
  addExportDefault = this.importsExports.addExportDefault.bind(
    this.importsExports,
  );
  addToDefaultExport = this.importsExports.addToDefaultExport.bind(
    this.importsExports,
  );
  addExportFrom = this.importsExports.addExportFrom.bind(this.importsExports);
  addExportStar = this.importsExports.addExportStar.bind(this.importsExports);

  getDefaultExportKeys(): string[] {
    return [...this.importsExports.exports]
      .filter((exp) => exp.type === "refsDefault")
      .map((exp) => (exp as any).as);
  }

  registerRef(name: string, suffix?: string) {
    if (this.dirBuilder._refs.has(name)) {
      throw new Error(`ref name: ${name} already registered`);
    }

    this.dirBuilder._refs.set(name, {
      dir: this.dir,
      internalName: suffix
        ? genutil.getInternalName({ id: suffix, fqn: name })
        : name,
    });
  }

  nl(): void {
    this.buf.nl();
  }

  indented(nested: () => void): void {
    this.buf.indented(nested);
  }

  increaseIndent(): void {
    this.buf.increaseIndent();
  }

  decreaseIndent(): void {
    this.buf.decreaseIndent();
  }

  writeln(...lines: AnyCodeFrag[][]): void {
    this.buf.writeln(...lines);
  }

  writeBuf(buf: CodeBuffer) {
    this.buf.writeBuf(buf);
  }

  private resolveIdentRef(
    identRef: IdentRef,
    importsExports: BuilderImportsExports,
  ): string {
    const ref = this.dirBuilder._refs.get(identRef.name);

    if (!ref) {
      throw new Error(`Cannot find ref: ${identRef.name}`);
    }

    let prefix = "";
    if (ref.dir !== this.dir) {
      const namespaceParts = identRef.name.split("::").slice(0, -1);
      prefix = `_${namespaceParts.join("")}`;
      const moduleFileName = namespaceParts.at(-1)!;

      let importPath = path.posix.join(
        path.posix.relative(
          path.posix.dirname(this.dir),
          path.posix.dirname(ref.dir),
        ),
        moduleFileName,
      );

      if (!importPath.startsWith("../")) {
        importPath = "./" + importPath;
      }

      importsExports.addImportStar(prefix, importPath, {
        allowFileExt: true,
        typeOnly: true,
      });
    }

    return (
      (prefix ? prefix + "." : "") +
      (identRef.opts?.prefix ?? "") +
      ref.internalName
    );
  }

  render({
    mode,
    moduleKind,
    forceDefaultExport,
    moduleExtension,
  }: {
    mode: Mode;
    moduleKind: ModuleKind;
    forceDefaultExport?: boolean;
    moduleExtension: string;
  }): string {
    moduleKind ??= mode === "js" ? "cjs" : "esm";

    const importsExports = this.importsExports.clone();

    let body = "";
    for (const lineFrags of this.buf.getBuf()) {
      const line = lineFrags
        .map((frag) => {
          if (typeof frag === "string") {
            return frag;
          } else if (frag.type === "identRef") {
            return this.resolveIdentRef(frag, importsExports);
          } else if (frag.modes.has(mode)) {
            return frag.content
              .map((contentFrag) =>
                typeof contentFrag === "string"
                  ? contentFrag
                  : this.resolveIdentRef(contentFrag, importsExports),
              )
              .join("");
          } else {
            return "";
          }
        })
        .join("");
      if (line.trim().length || line.endsWith("\n")) {
        body += line + (!line.endsWith("\n") ? "\n" : "");
      }
    }

    const helpers = new Set<keyof typeof importExportHelpers>();

    const { exports, exportsFrom } = importsExports.renderExports({
      mode,
      moduleKind,
      refs: this.dirBuilder._refs,
      helpers,
      forceDefaultExport,
      extension: moduleExtension,
    });

    body += "\n\n" + exports;

    let head =
      mode === "js" && moduleKind === "cjs"
        ? `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });\n`
        : "";

    const imports = importsExports.renderImports({
      mode,
      moduleKind,
      helpers,
      extension: moduleExtension,
    });

    if (helpers.size) {
      head += [...helpers.values()]
        .map((helperName) => importExportHelpers[helperName])
        .join("\n");
    }
    head += exportsFrom + "\n";
    head += imports;

    if (head && body) {
      head += "\n";
    }

    return (head + body).trim() + "\n";
  }

  isEmpty(): boolean {
    return (
      this.buf.isEmpty() &&
      !this.importsExports.imports.size &&
      !this.importsExports.exports.size
    );
  }
}

let moduleCounter = 0;

export class DirBuilder {
  _map = new StrictMap<string, CodeBuilder>();
  _refs = new Map<string, { internalName: string; dir: string }>();
  _modules = new Map<string, string[]>();

  getPath(fn: string): CodeBuilder {
    if (!this._map.has(fn)) {
      this._map.set(fn, new CodeBuilder(this, fn));
    }
    return this._map.get(fn);
  }

  getModule(moduleName: string): CodeBuilder {
    if (!this._modules.has(moduleName)) {
      let partialName = "";
      let partialPath: string[] = [];

      for (const part of moduleName.split("::")) {
        partialName += (partialName && "::") + part;

        const existingMod = this._modules.get(partialName);
        if (!existingMod) {
          partialPath.push(
            genutil.makeValidIdent({
              name: part,
              id: `${moduleCounter++}`,
              skipKeywordCheck: true,
            }),
          );

          this._modules.set(partialName, [...partialPath]);
        } else {
          partialPath = [...existingMod];
        }
      }
    }

    const modPath = this._modules.get(moduleName)!;
    const mod = this.getPath(`modules/${modPath.join("/")}`);

    const root = Array(modPath.length).fill("..").join("/");
    mod.addImportStar("$", `${root}/reflection`, { allowFileExt: true });
    mod.addImportStar("_", `${root}/imports`, { allowFileExt: true });

    return mod;
  }

  debug(): string {
    const buf = [];
    for (const [fn, _builder] of this._map.entries()) {
      buf.push(`>>> ${fn}\n`);
      // buf.push(builder.render());
      buf.push(`\n`);
    }
    return buf.join("\n");
  }

  async write(
    to: string,
    params: {
      mode: "ts" | "js" | "dts";
      moduleKind: ModuleKind;
      fileExtension: string;
      moduleExtension: string;
      written: Set<string>;
    },
    headerComment = "",
  ): Promise<void> {
    const dir = path.normalize(to);

    for (const [fn, builder] of this._map.entries()) {
      if (builder.isEmpty()) {
        continue;
      }

      const dest = path.join(dir, fn);
      const destDir = path.dirname(dest);

      if (!(await exists(destDir))) {
        await fs.mkdir(destDir, { recursive: true });
      }

      const forceDefaultExport = fn.startsWith("modules/");

      if (forceDefaultExport) {
        const moduleDepth = fn.split("/").length;
        const nestedModules = [...this._modules.entries()].filter(
          ([_, _modPath]) => {
            if (_modPath.length !== moduleDepth) return false;
            const modPath = `modules/${_modPath.join("/")}`;
            return modPath !== fn && modPath.startsWith(fn);
          },
        );
        for (const [name, modPath] of nestedModules) {
          const modName = `_module__${modPath[modPath.length - 1]}`;
          builder.addImportDefault(modName, `./${modPath.slice(-2).join("/")}`);
          builder.addToDefaultExport(modName, name.split("::").pop()!);
        }
      }

      const filePath = dest + params.fileExtension;

      const oldContents = await readFileUtf8(filePath)
        .then((content) => content)
        .catch(() => "");

      const newContents =
        headerComment +
        builder.render({
          mode: params.mode,
          moduleKind: params.moduleKind,
          moduleExtension: params.moduleExtension,
          forceDefaultExport,
        });
      params.written.add(filePath);
      if (oldContents !== newContents) {
        await fs.writeFile(filePath, newContents);
      }
    }
  }
}

const groupToMapBy = <K, V>(
  items: Iterable<V>,
  by: (item: V) => K,
): ReadonlyMap<K, readonly V[]> =>
  [...items].reduce((map, item) => {
    const groupKey = by(item);
    const prev = map.get(groupKey) ?? [];
    map.set(groupKey, [...prev, item]);
    return map;
  }, new Map<K, V[]>());
