/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2019-present MagicStack Inc. and the Gel authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as errors from "./index";
import { ErrorAttr, type ErrorType } from "./base";
import { errorMapping } from "./map";

export function resolveErrorCode(code: number): ErrorType {
  let result: ErrorType | undefined;

  result = errorMapping.get(code);
  if (result) {
    return result;
  }

  code = code & 0xff_ff_ff_00;
  result = errorMapping.get(code);
  if (result) {
    return result;
  }

  code = code & 0xff_ff_00_00;
  result = errorMapping.get(code);
  if (result) {
    return result;
  }

  code = code & 0xff_00_00_00;
  result = errorMapping.get(code);
  if (result) {
    return result;
  }

  return errors.GelError;
}

const _JSON_FIELDS = {
  hint: ErrorAttr.hint,
  details: ErrorAttr.details,
  start: ErrorAttr.characterStart,
  end: ErrorAttr.characterEnd,
  line: ErrorAttr.lineStart,
  col: ErrorAttr.columnStart,
};

export function errorFromJSON(data: any) {
  const errType = resolveErrorCode(data.code);
  const err = new errType(data.message);

  const attrs = new Map<number, string>();
  for (const [name, field] of Object.entries(_JSON_FIELDS)) {
    if (data[name] != null) {
      attrs.set(field, data[name]);
    }
  }
  (err as any)._attrs = attrs;

  return err;
}
