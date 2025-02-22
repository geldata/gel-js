import type { $ } from "gel";
import type { cardutil } from "../../packages/generate/src/syntax/cardinality";
import { tc } from "./setupTeardown";

describe("cardinality", () => {
  test("multiply$.Cardinality", () => {
    tc.assert<
      tc.IsExact<
        cardutil.multiplyCardinalities<$.Cardinality.One, $.Cardinality.One>,
        $.Cardinality.One
      >
    >(true);
    tc.assert<
      tc.IsExact<
        cardutil.multiplyCardinalities<
          $.Cardinality.AtLeastOne,
          $.Cardinality.Many
        >,
        $.Cardinality.Many
      >
    >(true);
    tc.assert<
      tc.IsExact<
        cardutil.multiplyCardinalities<
          $.Cardinality.AtLeastOne,
          $.Cardinality.AtLeastOne
        >,
        $.Cardinality.AtLeastOne
      >
    >(true);
    tc.assert<
      tc.IsExact<
        cardutil.multiplyCardinalities<
          $.Cardinality.AtMostOne,
          $.Cardinality.AtMostOne
        >,
        $.Cardinality.AtMostOne
      >
    >(true);
    tc.assert<
      tc.IsExact<
        cardutil.multiplyCardinalities<$.Cardinality.Empty, $.Cardinality.Many>,
        $.Cardinality.Empty
      >
    >(true);
  });

  test("merge$.Cardinality", () => {
    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalities<$.Cardinality.AtMostOne, $.Cardinality.One>,
        $.Cardinality.AtLeastOne
      >
    >(true);

    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalities<
          $.Cardinality.AtMostOne,
          $.Cardinality.AtMostOne
        >,
        $.Cardinality.Many
      >
    >(true);

    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalities<$.Cardinality.One, $.Cardinality.One>,
        $.Cardinality.AtLeastOne
      >
    >(true);

    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalities<
          $.Cardinality.Empty,
          $.Cardinality.AtLeastOne
        >,
        $.Cardinality.AtLeastOne
      >
    >(true);

    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalities<$.Cardinality.One, $.Cardinality.Many>,
        $.Cardinality.AtLeastOne
      >
    >(true);

    tc.assert<
      tc.IsExact<
        cardutil.mergeCardinalitiesVariadic<
          [$.Cardinality.One, $.Cardinality.Empty, $.Cardinality.AtMostOne]
        >,
        $.Cardinality.AtLeastOne
      >
    >(true);
  });
});
