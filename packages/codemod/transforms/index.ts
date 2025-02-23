import { API, FileInfo, Options } from 'jscodeshift';
import importsRename from './imports-rename.js'
import importIdentifierRename from './import-identifier-rename.js'

export default function transform(
  file: FileInfo,
  api: API,
  options: Options
) {
  const transforms = [importIdentifierRename, importsRename];
  let src = file.source;

  transforms.forEach(fix => {
    if (typeof (src) === "undefined") { return; }
    const nextSrc = fix({ ...file, source: src }, api, options);

    if (nextSrc) {
      src = nextSrc;
    }
  });

  return src;
}

export const parser = 'tsx';
