import assert from "node:assert/strict";
import type * as $ from "../../packages/generate/src/syntax/reflection";
import e from "./dbschema/edgeql-js";
import { tc } from "./setupTeardown";

describe("with", () => {
  test("simple repeated expression", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.equal(
      e.select(e.op(numbers, "+", numbers)).toEdgeQL(),
      `WITH
  __withVar_0 := { <std::int64>1, <std::int64>2, <std::int64>3 }
SELECT (__withVar_0 + __withVar_0)`,
    );
  });

  test("simple expression with alias", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.equal(
      e.select(e.op(numbers, "+", e.alias(numbers))).toEdgeQL(),
      `WITH
  __withVar_0 := { <std::int64>1, <std::int64>2, <std::int64>3 },
  __withVar_1 := __withVar_0
SELECT (__withVar_0 + __withVar_1)`,
    );
  });

  test("implicit WITH vars referencing each other", () => {
    const skip = e.int64(10);
    const remainingHeros = e.select(e.Hero, (hero) => ({
      order_by: hero.id,
      offset: skip,
    }));
    const pageResults = e.select(remainingHeros, () => ({
      id: true,
      name: true,
      limit: 10,
    }));

    const query = e.select({
      pageResults,
      nextOffset: e.op(skip, "+", e.count(pageResults)),
      hasMore: e.select(e.op(e.count(remainingHeros), ">", 10)),
    });

    assert.equal(
      query.toEdgeQL(),
      `WITH
  __withVar_4 := <std::int64>10,
  __withVar_3 := (
    WITH
      __scope_2_defaultHero := DETACHED default::Hero
    SELECT __scope_2_defaultHero {
      id
    }
    ORDER BY __scope_2_defaultHero.id
    OFFSET __withVar_4
  ),
  __withVar_1 := (
    WITH
      __scope_0_defaultHero := __withVar_3
    SELECT __scope_0_defaultHero {
      id,
      name
    }
    LIMIT 10
  )
SELECT {
  multi pageResults := (__withVar_1 {id, name}),
  single nextOffset := (__withVar_4 + std::count(__withVar_1)),
  single hasMore := (SELECT (std::count(__withVar_3) > 10))
}`,
    );

    type queryType = $.BaseTypeToTsType<(typeof query)["__element__"]>;
    tc.assert<
      tc.IsExact<
        queryType,
        {
          pageResults: {
            id: string;
            name: string;
          }[];
          nextOffset: number;
          hasMore: boolean;
        }
      >
    >(true);
  });

  test("simple repeated expression not in select expr", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.throws(() => e.op(numbers, "+", numbers).toEdgeQL());
  });

  test("explicit WITH block", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.equal(
      e.with([numbers], e.select(numbers)).toEdgeQL(),
      `WITH
  __withVar_0 := { <std::int64>1, <std::int64>2, <std::int64>3 }
SELECT __withVar_0`,
    );
  });

  test("explicit WITH block in nested query", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.equal(
      e
        .select({
          nested: e.with([numbers], e.select(numbers)),
        })
        .toEdgeQL(),
      `SELECT {
  multi nested := assert_exists((
    WITH
      __withVar_0 := { <std::int64>1, <std::int64>2, <std::int64>3 }
    SELECT __withVar_0
  ))
}`,
    );
  });

  test("explicit WITH in nested query, var used outside WITH block", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    assert.throws(() =>
      e
        .select({
          numbers,
          nested: e.with([numbers], e.select(numbers)),
        })
        .toEdgeQL(),
    );
  });

  test("explicit WITH block nested in implicit WITH block", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    const explicitWith = e.with([numbers], e.select(numbers));

    assert.equal(
      e
        .select({
          numbers: explicitWith,
          numbers2: explicitWith,
        })
        .toEdgeQL(),
      `WITH
  __withVar_0 := (
    WITH
      __withVar_1 := { <std::int64>1, <std::int64>2, <std::int64>3 }
    SELECT __withVar_1
  )
SELECT {
  multi numbers := assert_exists(__withVar_0),
  multi numbers2 := assert_exists(__withVar_0)
}`,
    );
  });

  test("explicit WITH block nested in explicit WITH block", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    const explicitWith = e.with([numbers], e.select(numbers));

    assert.equal(
      e
        .with(
          [explicitWith],
          e.select({
            numbers: explicitWith,
          }),
        )
        .toEdgeQL(),
      `WITH
  __withVar_0 := (
    WITH
      __withVar_1 := { <std::int64>1, <std::int64>2, <std::int64>3 }
    SELECT __withVar_1
  )
SELECT {
  multi numbers := assert_exists(__withVar_0)
}`,
    );
  });

  test("explicit WITH block nested in explicit WITH block, sub expr explicitly extracted", () => {
    const number = e.int64(2);
    const numbers = e.set(e.int64(1), number, e.int64(3));

    const explicitWith = e.with([numbers], e.select(numbers));

    assert.equal(
      e
        .with(
          [explicitWith, number],
          e.select({
            numbers: explicitWith,
          }),
        )
        .toEdgeQL(),
      `WITH
  __withVar_2 := <std::int64>2,
  __withVar_0 := (
    WITH
      __withVar_1 := { <std::int64>1, __withVar_2, <std::int64>3 }
    SELECT __withVar_1
  )
SELECT {
  multi numbers := assert_exists(__withVar_0)
}`,
    );
  });

  test("explicit WITH nested in explicit WITH, expr declared in both", () => {
    const number = e.int64(2);
    const numbers = e.set(e.int64(1), number, e.int64(3));

    const explicitWith = e.with([numbers], e.select(numbers));

    assert.throws(() =>
      e
        .with(
          [explicitWith, numbers],
          e.select({
            numbers: explicitWith,
          }),
        )
        .toEdgeQL(),
    );
  });

  test("explicit WITH block nested in explicit WITH block, sub expr implicitly extracted", () => {
    const number = e.int64(2);
    const numbers = e.set(e.int64(1), number, e.int64(3));

    const explicitWith = e.with([numbers], e.select(numbers));

    assert.equal(
      e
        .with(
          [explicitWith],
          e.select({
            number,
            numbers: explicitWith,
          }),
        )
        .toEdgeQL(),
      `WITH
  __withVar_2 := <std::int64>2,
  __withVar_0 := (
    WITH
      __withVar_1 := { <std::int64>1, __withVar_2, <std::int64>3 }
    SELECT __withVar_1
  )
SELECT {
  single number := __withVar_2,
  multi numbers := assert_exists(__withVar_0)
}`,
    );
  });

  test("implicit WITH and explicit WITH in sub expr", () => {
    const skip = e.int64(10);
    const remainingHeros = e.select(e.Hero, (hero) => ({
      order_by: hero.id,
      offset: skip,
    }));
    const pageResults = e.select(remainingHeros, () => ({
      id: true,
      name: true,
      limit: 10,
    }));

    const nextOffset = e.op(skip, "+", e.count(pageResults));

    const query = e.select({
      pageResults,
      nextOffset: e.with([nextOffset], e.select(nextOffset)),
      hasMore: e.select(e.op(e.count(remainingHeros), ">", 10)),
    });

    assert.equal(
      query.toEdgeQL(),
      `WITH
  __withVar_5 := <std::int64>10,
  __withVar_4 := (
    WITH
      __scope_1_defaultHero := DETACHED default::Hero
    SELECT __scope_1_defaultHero {
      id
    }
    ORDER BY __scope_1_defaultHero.id
    OFFSET __withVar_5
  ),
  __withVar_3 := (
    WITH
      __scope_0_defaultHero := __withVar_4
    SELECT __scope_0_defaultHero {
      id,
      name
    }
    LIMIT 10
  )
SELECT {
  multi pageResults := (__withVar_3 {id, name}),
  single nextOffset := (
    WITH
      __withVar_2 := (__withVar_5 + std::count(__withVar_3))
    SELECT __withVar_2
  ),
  single hasMore := (SELECT (std::count(__withVar_4) > 10))
}`,
    );
  });

  test("explicit WITH nested in implicit WITH + alias implicit", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    const numbersAlias = e.alias(numbers);

    const explicitWith = e.with([numbers], e.select({ numbers, numbersAlias }));

    assert.equal(
      e
        .select({
          numbers: explicitWith,
          numbers2: explicitWith,
        })
        .toEdgeQL(),
      `WITH
  __withVar_0 := (
    WITH
      __withVar_1 := { <std::int64>1, <std::int64>2, <std::int64>3 },
      __withVar_2 := __withVar_1
    SELECT {
      multi numbers := assert_exists(__withVar_1),
      multi numbersAlias := assert_exists(__withVar_2)
    }
  )
SELECT {
  single numbers := __withVar_0,
  single numbers2 := __withVar_0
}`,
    );
  });

  test("explicit WITH nested in implicit WITH + alias explicit", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    const numbersAlias = e.alias(numbers);

    const explicitWith = e.with(
      [numbers, numbersAlias],
      e.select({ numbers, numbersAlias }),
    );

    assert.equal(
      e
        .select({
          numbers: explicitWith,
          numbers2: explicitWith,
        })
        .toEdgeQL(),
      `WITH
  __withVar_0 := (
    WITH
      __withVar_2 := { <std::int64>1, <std::int64>2, <std::int64>3 },
      __withVar_3 := __withVar_2
    SELECT {
      multi numbers := assert_exists(__withVar_2),
      multi numbersAlias := assert_exists(__withVar_3)
    }
  )
SELECT {
  single numbers := __withVar_0,
  single numbers2 := __withVar_0
}`,
    );
  });

  test("explicit WITH nested in implicit WITH + alias outside WITH", () => {
    const numbers = e.set(e.int64(1), e.int64(2), e.int64(3));

    const numbersAlias = e.alias(numbers);

    const explicitWith = e.with([numbers], e.select({ numbers, numbersAlias }));

    assert.throws(() =>
      e
        .select({
          numbers: explicitWith,
          numbers2: explicitWith,
          numbersAlias,
        })
        .toEdgeQL(),
    );
  });

  test(
    "explicit WITH block nested in explicit WITH block, " +
      "alias declared in inner WITH",
    () => {
      const number = e.int64(2);
      const numbers = e.set(e.int64(1), number, e.int64(3));

      const numbersAlias = e.alias(numbers);

      const arg = e.op(numbers, "+", numbersAlias);
      const explicitWith = e.with([numbersAlias], e.select(arg));

      assert.equal(
        e
          .with(
            [explicitWith, numbers],
            e.select({
              numbers: explicitWith,
            }),
          )
          .toEdgeQL(),
        `WITH
  __withVar_1 := { <std::int64>1, <std::int64>2, <std::int64>3 },
  __withVar_0 := (
    WITH
      __withVar_2 := __withVar_1
    SELECT (__withVar_1 + __withVar_2)
  )
SELECT {
  multi numbers := assert_exists(__withVar_0)
}`,
      );
    },
  );

  test(
    "explicit WITH block nested in explicit WITH block, " +
      "alias of alias declared in inner WITH",
    () => {
      const number = e.int64(2);
      const numbers = e.set(e.int64(1), number, e.int64(3));

      const numbersAlias = e.alias(numbers);
      const numbersAlias2 = e.alias(numbersAlias);

      const explicitWith = e.with(
        [numbersAlias2],
        e.select(e.op(numbers, "+", numbersAlias2)),
      );

      assert.equal(
        e
          .with(
            [explicitWith, numbers],
            e.select({
              numbers: explicitWith,
            }),
          )
          .toEdgeQL(),
        `\
WITH
  __withVar_1 := { <std::int64>1, <std::int64>2, <std::int64>3 },
  __withVar_2 := __withVar_1,
  __withVar_0 := (
    WITH
      __withVar_3 := __withVar_2
    SELECT (__withVar_1 + __withVar_3)
  )
SELECT {
  multi numbers := assert_exists(__withVar_0)
}`,
      );
    },
  );

  test("query with no WITH block", () => {
    const query = e.select(e.Person.is(e.Hero), (person) => ({
      id: true,
      computable: e.int64(35),
      all_heroes: e.select(e.Hero, () => ({ __type__: { name: true } })),
      order_by: person.name,
      limit: 1,
    }));

    assert.equal(
      query.toEdgeQL(),
      `\
WITH
  __scope_0_defaultHero := DETACHED default::Person[IS default::Hero]
SELECT __scope_0_defaultHero {
  id,
  single computable := <std::int64>35,
  multi all_heroes := (
    WITH
      __scope_1_defaultHero := DETACHED default::Hero
    SELECT __scope_1_defaultHero {
      __type__ := (
        WITH
          __scope_2_schemaObjectType := __scope_1_defaultHero.__type__
        SELECT __scope_2_schemaObjectType {
          name
        }
      )
    }
  )
}
ORDER BY __scope_0_defaultHero.name
LIMIT 1`,
    );
  });

  test("repeated expression referencing scoped select object", () => {
    const query = e.select(e.Hero, (hero) => {
      const secret = e.op(
        e.op(hero.name, "++", " is "),
        "++",
        hero.secret_identity,
      );
      return {
        name: true,
        secret,
        secret2: secret,
      };
    });

    assert.equal(
      query.toEdgeQL(),
      `\
WITH
  __scope_0_defaultHero_expr := DETACHED default::Hero,
  __scope_0_defaultHero := (FOR __scope_0_defaultHero_inner IN {__scope_0_defaultHero_expr} UNION (
    WITH
      __withVar_1 := ((__scope_0_defaultHero_inner.name ++ " is ") ++ __scope_0_defaultHero_inner.secret_identity)
    SELECT __scope_0_defaultHero_inner {
      __withVar_1 := __withVar_1
    }
  ))
SELECT __scope_0_defaultHero {
  name,
  single secret := __scope_0_defaultHero.__withVar_1,
  single secret2 := __scope_0_defaultHero.__withVar_1
}`,
    );
  });

  test("repeated expr used outside scope", () => {
    const expr = e.to_str(e.int64(123));
    const query = e.tuple([expr, e.select(expr)]);

    assert.throws(() => query.toEdgeQL());
  });
});
