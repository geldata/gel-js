import * as edgedb from "edgedb"
import { test } from "test";

const x = edgedb.createClient()

function y() {
  return edgedb.someFunction();
}

const { } = edgedb;
const { } = { ...edgedb };
