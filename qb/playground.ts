// tslint:disable:no-console
import * as edgedb from "edgedb";
import type {$Movie} from "./dbschema/edgeql-js/modules/default";
import type {pointersToSelectShape} from "./dbschema/edgeql-js/syntax/select";
import {setupTests} from "./test/setupTeardown";

import e from "./dbschema/edgeql-js";

export function someFunc(arg: string) {
  return arg.length;
}
export type someFunc = {asdf: number};

async function run() {
  const {client} = await setupTests();
}

run();
export {};
