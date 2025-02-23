import { dts, t, r, ts } from "../builders";
import type { GeneratorParams } from "../genutil";

export const generateRuntimeSpec = (params: GeneratorParams) => {
  const { dir, types, gelVersion } = params;

  const spec = dir.getPath("__spec__");

  spec.addImportStar("$", "./reflection", { allowFileExt: true });
  spec.writeln([
    dts`declare `,
    `const spec`,
    t`: $.introspect.Types`,
    r` = new $.StrictMap()`,
    `;`,
  ]);
  spec.nl();

  for (const type of types.values()) {
    spec.writeln([
      r`spec.set("${type.id}", ${JSON.stringify(type)}`,
      ts` as any`,
      r`);`,
    ]);
  }

  spec.nl();
  spec.writeln([
    dts`declare `,
    `const complexParamKinds`,
    t`: Set<$.TypeKind>`,
    r` = new Set([${
      gelVersion.major <= 2 ? `$.TypeKind.tuple, $.TypeKind.namedtuple` : ""
    }])`,
    `;`,
  ]);

  spec.addExport("spec");
  spec.addExport("complexParamKinds");
};
