import assert from "node:assert/strict";
import * as $ from "../../packages/generate/src/syntax/reflection";
import e from "./dbschema/edgeql-js/index";
import { $PathNode } from "./dbschema/edgeql-js/syntax";
import { tc } from "./setupTeardown";

describe("paths", () => {
  test("path structure", () => {
    const Hero = e.default.Hero;
    type Hero = typeof Hero;
    const $Hero = e.Hero.__element__;
    const $Villain = e.Villain.__element__;
    const HeroSetSingleton = $.$toSet($Hero, $.Cardinality.One);
    const HeroSingleton = $PathNode(HeroSetSingleton, null);
    type HeroSingleton = typeof HeroSingleton;
    const VillainRoot = $.$toSet($Villain, $.Cardinality.One);
    const Villain = $PathNode(VillainRoot, null);

    assert.deepEqual(Hero.name.__element__.__kind__, $.TypeKind.scalar);
    assert.equal(Hero.name.__element__.__name__, "std::str");
    assert.deepEqual(Hero.name.__cardinality__, $.Cardinality.Many);
    assert.deepEqual(HeroSingleton.name.__cardinality__, $.Cardinality.One);

    assert.equal(
      Villain["<villains[is Hero]"].__element__.__name__,
      "default::Hero",
    );

    // check path root cardinalities
    tc.assert<tc.IsExact<Hero["__cardinality__"], $.Cardinality.Many>>(true);
    tc.assert<tc.IsExact<HeroSingleton["__cardinality__"], $.Cardinality.One>>(
      true,
    );

    // Hero.name
    assert.equal(Hero.name.__element__.__name__, "std::str");
    assert.deepEqual(Hero.name.__cardinality__, $.Cardinality.Many);
    tc.assert<tc.IsExact<Hero["name"]["__cardinality__"], $.Cardinality.Many>>(
      true,
    );

    // HeroSingleton.name
    assert.deepEqual(HeroSingleton.name.__cardinality__, $.Cardinality.One);
    tc.assert<
      tc.IsExact<HeroSingleton["name"]["__cardinality__"], $.Cardinality.One>
    >(true);

    // AtMostOneHero.name
    // test cardinality merging
    const HeroSetAtLeastOne = $.$toSet($Hero, $.Cardinality.AtLeastOne);
    const AtLeastOneHero = $PathNode(HeroSetAtLeastOne, null);
    type AtLeastOneHero = typeof AtLeastOneHero;
    assert.deepEqual(
      AtLeastOneHero.id.__cardinality__,
      $.Cardinality.AtLeastOne,
    );
    assert.deepEqual(
      AtLeastOneHero.number_of_movies.__cardinality__,
      $.Cardinality.AtLeastOne,
    );
    tc.assert<
      tc.IsExact<
        AtLeastOneHero["number_of_movies"]["__cardinality__"],
        $.Cardinality.AtLeastOne
      >
    >(true);

    // Hero.villains.id
    assert.deepEqual(Hero.villains.id.__cardinality__, $.Cardinality.Many);
    tc.assert<
      tc.IsExact<
        HeroSingleton["villains"]["id"]["__cardinality__"],
        $.Cardinality.Many
      >
    >(true);

    assert.equal(
      Hero.villains.nemesis.villains.name.toEdgeQL(),
      "DETACHED default::Hero.villains.nemesis.villains.name",
    );
    const Herotype = Hero.__type__.__type__.__type__;
    assert.equal(
      Herotype.annotations.__type__.computed_fields.toEdgeQL(),
      "DETACHED default::Hero.__type__.__type__.__type__.annotations.__type__.computed_fields",
    );
    assert.ok(Hero.villains.__parent__);
    assert.equal(Hero.villains.__parent__?.linkName, "villains");
    assert.equal(
      Hero.villains.__parent__?.type.__element__.__name__,
      "default::Hero",
    );
  });

  test("type intersection on path node", () => {
    const $Hero = e.Hero.__element__;
    const person = e.Person;
    const hero = person.is(e.Hero);
    tc.assert<
      tc.IsExact<
        (typeof hero)["__element__"]["__pointers__"],
        (typeof $Hero)["__pointers__"]
      >
    >(true);
    tc.assert<
      tc.IsExact<
        (typeof hero)["__element__"]["__name__"],
        (typeof $Hero)["__name__"]
      >
    >(true);
    tc.assert<
      tc.IsExact<(typeof hero)["__element__"]["__shape__"], { id: true }>
    >(true);
    assert.deepEqual(hero.__element__.__shape__, { id: true });
    assert.equal(hero.__element__.__name__, "default::Hero");
    assert.deepEqual(hero.__element__.__kind__, $.TypeKind.object);
    assert.deepEqual(hero.__kind__, $.ExpressionKind.TypeIntersection);
    // referential equality
    assert.equal(hero.__expr__, person);
    // check that pathify works
    assert.equal(hero.number_of_movies.__element__.__name__, "std::int64");
    assert.equal(hero.toEdgeQL(), `DETACHED default::Person[IS default::Hero]`);
  });

  test("type intersection on select", () => {
    const q2 = e.select(e.Person, () => ({ id: true, name: true, limit: 5 }));
    const hero = q2.is(e.Hero);
    assert.equal(hero.__element__.__name__, "default::Hero");
    assert.deepEqual(hero.__element__.__kind__, $.TypeKind.object);
    assert.deepEqual(hero.__kind__, $.ExpressionKind.TypeIntersection);
    // referential equality
    assert.equal(hero.__expr__, q2);
    // check that pathify works
    assert.equal(hero.number_of_movies.__element__.__name__, "std::int64");
  });

  test("assert_single", () => {
    const singleHero = e.Hero.assert_single();
    tc.assert<
      tc.IsExact<
        (typeof singleHero)["__cardinality__"],
        $.Cardinality.AtMostOne
      >
    >(true);
    assert.deepEqual(singleHero.__cardinality__, $.Cardinality.AtMostOne);
  });
});
