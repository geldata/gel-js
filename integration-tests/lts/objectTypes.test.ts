import assert from "node:assert/strict";
import * as $ from "../../packages/generate/src/syntax/reflection";
import type { PropertyDesc } from "../../packages/generate/src/syntax/typesystem";
import e from "./dbschema/edgeql-js";
import type { $str } from "./dbschema/edgeql-js/modules/std";
import { tc } from "./setupTeardown";

const $Hero = e.default.Hero.__element__;
const $AnnotationSubject = e.schema.AnnotationSubject.__element__;
const $Bag = e.default.Bag.__element__;
const $Simple = e.default.Simple.__element__;
const $Z = e.default.Z.__element__;

describe("object types", () => {
  test("property hydration", () => {
    assert.equal(typeof $Hero, "object");
    assert.equal($Hero.__name__, "default::Hero");
    assert.equal($Hero.__pointers__.name.__kind__, "property");
    assert.equal($Hero.__pointers__.name.cardinality, $.Cardinality.One);
    assert.deepEqual($Hero.__pointers__.name.target, e.std.str);
    assert.deepEqual(
      $Hero.__pointers__.name.target.__kind__,
      $.TypeKind.scalar,
    );
    assert.equal($Hero.__pointers__.name.exclusive, true);
    assert.equal($Hero.__pointers__.secret_identity.exclusive, false);

    assert.equal(
      e.default.Movie.__element__.__pointers__.profile.exclusive,
      true,
    );
    assert.equal(
      e.default.Movie.__element__.__pointers__.characters.exclusive,
      false,
    );
  });

  test("link hydration", () => {
    assert.equal($Hero.__pointers__.villains.__kind__, "link");
    assert.equal(
      $Hero.__pointers__.villains.target.__kind__,
      $.TypeKind.object,
    );
    assert.equal($Hero.__pointers__.villains.cardinality, $.Cardinality.Many);
    assert.equal(
      $Hero.__pointers__.villains.target.__name__,
      "default::Villain",
    );
    assert.deepEqual($Hero.__pointers__.villains.properties, {});

    // type union link
    assert.equal($Z.__pointers__.xy.__kind__, "link");
    assert.deepEqual(
      Object.keys($Z.__pointers__.xy.target.__pointers__).sort(),
      ["__type__", "a", "id"],
    );
    assert.equal(
      $Z.__pointers__.xy.target.__pointers__.a.target.__name__,
      "std::str",
    );
    assert.equal(
      $Z.__pointers__.xy.target.__name__,
      "default::X | default::Y | default::W",
    );
  });

  const link = $AnnotationSubject.__pointers__.annotations;
  test("link properties", () => {
    assert.equal(link.properties["@value"].target.__name__, "std::str");
    assert.deepEqual(
      link.properties["@value"].cardinality,
      $.Cardinality.AtMostOne,
    );
    assert.equal(link.properties["@value"].__kind__, "property");
  });

  test("overloaded properties", () => {
    tc.assert<
      tc.IsExact<
        (typeof e.AdminUser)["__element__"]["__pointers__"]["username"],
        PropertyDesc<$str, $.Cardinality.One, true, false, false, false>
      >
    >(true);
  });

  test("named tuple tests", () => {
    // named tuple tests
    const BagShape = $Bag.__pointers__;
    assert.deepEqual(BagShape.namedTuple.cardinality, $.Cardinality.AtMostOne);

    const namedTuple = BagShape.namedTuple.target;
    assert.deepEqual(namedTuple.__kind__, $.TypeKind.namedtuple);
    assert.equal(namedTuple.__shape__.x.__name__, "std::str");
    assert.deepEqual(namedTuple.__shape__.x.__kind__, $.TypeKind.scalar);
    assert.equal(namedTuple.__shape__.y.__name__, "std::int64");
  });

  test("unnamed tuple tests", () => {
    // named tuple tests
    const BagShape = $Bag.__pointers__;
    const unnamedTuple = BagShape.unnamedTuple.target;
    assert.deepEqual(unnamedTuple.__kind__, $.TypeKind.tuple);
    assert.equal(unnamedTuple.__items__[0].__name__, "std::str");
    assert.equal(unnamedTuple.__items__[1].__name__, "std::int64");
  });

  test("array tests", () => {
    // named tuple tests
    const BagShape = $Bag.__pointers__;
    const arrayProp = BagShape.stringsArr.target;
    assert.deepEqual(arrayProp.__kind__, $.TypeKind.array);
    assert.equal(arrayProp.__element__.__name__, "std::str");
  });

  test("merging tests", () => {
    const merged = $.$mergeObjectTypes($Bag, $Simple);
    assert.equal(Object.keys(merged.__pointers__).length, 4);
    assert.equal(Object.keys(merged.__pointers__).includes("id"), true);
    assert.equal(Object.keys(merged.__pointers__).includes("__type__"), true);
    assert.equal(Object.keys(merged.__pointers__).includes("name"), true);
    assert.equal(Object.keys(merged.__pointers__).includes("age"), true);
    type merged = keyof (typeof merged)["__pointers__"];
    // shared keys
    tc.assert<tc.IsExact<merged, "id" | "__type__" | "name" | "age">>(true);
  });

  test("backlinks", () => {
    const heroMovie = e.Hero["<characters[is Movie]"];

    const heroVillain = e.Hero["<nemesis[is Villain]"];
    assert.equal(
      heroMovie.toEdgeQL(),
      `DETACHED default::Hero.<characters[is Movie]`,
    );
    assert.equal(heroMovie.__element__.__name__, "default::Movie");
    assert.equal(heroVillain.nemesis.__element__.__name__, "default::Hero");
    assert.deepEqual(
      e.select(e.Villain, () => ({ limit: 1 })).assert_single().nemesis
        .__cardinality__,
      $.Cardinality.AtMostOne,
    );

    assert.equal(e.Profile["<profile"].__element__.__name__, "std::BaseObject");
    assert.deepEqual(e.Profile["<profile"].__cardinality__, $.Cardinality.Many);

    const merged = $.$mergeObjectTypes(
      e.Hero.__element__,
      e.Villain.__element__,
    );
    assert.equal(
      merged.__pointers__["<characters"].target.__name__,
      "std::BaseObject",
    );
    assert.equal(
      merged.__pointers__["<characters[is Movie]"].target.__name__,
      "default::Movie",
    );
  });

  test("select *", () => {
    const movieStarShape = {
      id: true,
      title: true,
      genre: true,
      rating: true,
      release_year: true,
    };

    // on root object
    const movieStar = e.Movie["*"];

    assert.deepEqual(movieStar, movieStarShape);
    tc.assert<
      tc.IsExact<
        typeof movieStar,
        {
          id: true;
          title: true;
          genre: true;
          rating: true;
          release_year: true;
        }
      >
    >(true);

    // on select scope
    e.select(e.Movie, (movie) => {
      assert.deepEqual(movie["*"], movieStarShape);

      return {};
    });

    // on wrapped select scope
    e.select(
      e.select(e.Movie, () => ({})),
      (movie) => {
        assert.deepEqual(movie["*"], movieStarShape);

        return {};
      },
    );

    // on polymorphic select scope
    e.select(e.Person.is(e.Hero), (hero) => {
      assert.deepEqual(hero["*"], {
        id: true,
        name: true,
        age: true,
        height: true,
        isAdult: true,
        secret_identity: true,
        number_of_movies: true,
      });

      return {};
    });

    // on insert select
    e.select(e.insert(e.Movie, { title: "test" }), (movie) => {
      assert.deepEqual(movie["*"], movieStarShape);

      return movie["*"];
    }).toEdgeQL();
  });
});
