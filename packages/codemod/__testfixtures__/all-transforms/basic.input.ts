import { createHttpClient } from "edgedb";
import { auth } from "@edgedb/auth";
import * as edb from "edgedb"
import { test } from "test";

const x = edb.createClient()

function y() {
    return edb.someFunction();
}

const { } = edb;
const { } = { ...edb };

