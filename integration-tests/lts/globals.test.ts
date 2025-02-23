import assert from "node:assert/strict";
import type * as gel from "gel";
import { $ } from "gel";

import e from "./dbschema/edgeql-js";

import { setupTests, teardownTests } from "./setupTeardown";

describe("globals", () => {
  let client: gel.Client;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("globals", async () => {
    assert.equal(
      e.select(e.global.uuid_global).toEdgeQL(),
      `SELECT (GLOBAL default::uuid_global)`,
    );

    const str_required = await e.select(e.global.str_required).run(client);
    assert.equal(str_required, `hi mom`);
    const str_required_multi = await e
      .select(e.global.str_required_multi)
      .run(client);
    assert.deepEqual(str_required_multi, ["hi", "mom"]);

    assert.equal(e.global.arr_global.__element__.__name__, `array<std::str>`);
    assert.deepEqual(
      e.global.arr_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(
      e.global.named_tuple_global.__element__.__name__,
      `tuple<name: std::str, age: std::int64>`,
    );
    assert.deepEqual(
      e.global.named_tuple_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(e.global.num_global.__element__.__name__, `std::int64`);
    assert.deepEqual(
      e.global.num_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(
      e.global.seq_global.__element__.__name__,
      `default::global_seq`,
    );
    assert.deepEqual(
      e.global.seq_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(e.global.str_global.__element__.__name__, `std::str`);
    assert.deepEqual(
      e.global.str_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(
      e.global.str_global_with_default.__element__.__name__,
      `std::str`,
    );
    assert.deepEqual(
      e.global.str_global_with_default.__cardinality__,
      $.Cardinality.One,
    );
    assert.equal(e.global.str_multi.__element__.__name__, `default::str_multi`);
    assert.deepEqual(
      e.global.str_multi.__cardinality__,
      $.Cardinality.AtLeastOne,
    );
    assert.equal(e.global.str_required.__element__.__name__, `std::str`);
    assert.deepEqual(e.global.str_required.__cardinality__, $.Cardinality.One);
    assert.equal(
      e.global.str_required_multi.__element__.__name__,
      `default::str_required_multi`,
    );
    assert.deepEqual(
      e.global.str_required_multi.__cardinality__,
      $.Cardinality.AtLeastOne,
    );
    assert.equal(
      e.global.tuple_global.__element__.__name__,
      `tuple<std::str, std::int64>`,
    );
    assert.deepEqual(
      e.global.tuple_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(e.global.uuid_global.__element__.__name__, `std::uuid`);
    assert.deepEqual(
      e.global.uuid_global.__cardinality__,
      $.Cardinality.AtMostOne,
    );
    assert.equal(e.extra.global.user_id.__element__.__name__, `std::uuid`);
    assert.deepEqual(
      e.extra.global.user_id.__cardinality__,
      $.Cardinality.AtMostOne,
    );
  });
});
