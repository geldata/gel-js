import type { API, FileInfo, Options } from 'jscodeshift';

const importsMap: Record<string, string> = {
  edgedb: 'gel',
  '@edgedb/auth': '@gel/auth',
};

export default function transform(
  file: FileInfo,
  { jscodeshift: j }: API,
  options: Options
) {
  const root = j(file.source);

  root.find(j.ImportDeclaration).forEach((path) => {
    const importSource = path.node.source.value
    if (typeof importSource === 'string' && importsMap[importSource]) {
      path.node.source.value = importsMap[importSource];
    }
  });

  return root.toSource();
}

export const parser = 'ts';
