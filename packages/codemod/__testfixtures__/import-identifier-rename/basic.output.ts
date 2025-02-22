import * as gel from "edgedb"
import { test } from "test";

const x = gel.createClient()

function y() {
  return gel.someFunction();
}

const { } = gel;
const { } = { ...gel };
