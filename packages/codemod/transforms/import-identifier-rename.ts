import type { API, FileInfo, Options } from 'jscodeshift';

// "import * as edgedb from 'edgedb'"
// renames `edgedb` identifier to `gel`

export default function transform(
  file: FileInfo,
  { jscodeshift: j }: API,
  options: Options
) {
  const root = j(file.source);
  let hasImportEdgeDBNamespaceSpecifier = false;
  let importIdentifier = '';

  root.find(j.ImportDeclaration).forEach((path) => {
    if (path.node.source.value !== 'edgedb' || !path.node.specifiers) {
      return;
    }

    const namespaceSpecifier = path.node.specifiers.find(
      (specifier) => specifier.type === 'ImportNamespaceSpecifier'
    );

    if (!namespaceSpecifier || !namespaceSpecifier.local) {
      return;
    }

    importIdentifier = namespaceSpecifier.local?.name;
    namespaceSpecifier.local.name = 'gel';
    hasImportEdgeDBNamespaceSpecifier = true;
  });

  if (!hasImportEdgeDBNamespaceSpecifier) {
    return root.toSource();
  }

  root.find(j.Identifier).forEach((path) => {
    const name = path.node.name
    if (name === importIdentifier) {
      path.node.name = 'gel';
    }
  });

  return root.toSource();
}

export const parser = 'ts';
