import { API, FileInfo, Options } from 'jscodeshift';
import importsRename from './transforms/imports-rename.js'

export default function transform(
  file: FileInfo,
  api: API,
  options: Options
) {
  const transforms = [importsRename, /* TODO: add more */];
  let src = file.source;

  transforms.forEach(fix => {
    if (typeof (src) === "undefined") { return; }
    const nextSrc = fix({ ...file }, api, options);

    if (nextSrc) {
      src = nextSrc;
    }
  });

  return src;
}

export const parser = 'tsx';
