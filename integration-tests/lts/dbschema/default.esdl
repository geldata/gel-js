using extension pgvector;
module default {

  scalar type Genre extending enum<"Horror", "Action", "RomCom", "Science Fiction", "Select">;
  global uuid_global -> uuid;
  global num_global -> int64;
  global arr_global -> array<str>;
  global tuple_global -> tuple<str, int64>;
  global named_tuple_global -> tuple<name: str, age: int64>;
  global str_global -> str;
  global str_global_with_default -> str {
    default := "hi mom";
  };
  multi global str_multi := {'hi', 'mom'};
  required global str_required -> str {
    default := 'hi mom';
  };
  required multi global str_required_multi := {'hi', 'mom'};

  scalar type global_seq extending sequence;
  global seq_global -> global_seq;



  abstract link movie_character {
    property character_name -> str;
  }

  abstract type LivingThing {
    age: int32;
  }

  abstract type Person extending LivingThing {
    required property name -> str {
      constraint exclusive;
    };
    property height -> decimal;
    property isAdult -> bool;
  }

  type Villain extending Person {
    link nemesis -> Hero;
  }

  type Hero extending Person {
    property secret_identity -> str;
    required property number_of_movies -> int64 {
      default := 0;
    };
    multi link villains := .<nemesis[IS Villain];
  }

  type Director {
    required property name -> str {
      constraint exclusive;
    };
  }

  scalar type year extending int16 {
    constraint min_value(1878);
  }

  type Movie {
    property genre -> Genre;
    property rating -> float64;
    required property title -> str {
      constraint exclusive;
    };
    required property release_year -> year {
      default := <int16>datetime_get(datetime_current(), 'year');
    }
    multi link characters extending movie_character -> Person;
    link profile -> Profile {
      constraint exclusive;
    }
    multi link directors -> Director;
    constraint exclusive on ((.title, .release_year));
  }

  type Profile {
    property plot_summary -> str;
    property slug -> str {
      readonly := true;
    }
    property a -> str;
    property b -> str;
    property c -> str;

    constraint exclusive on ((  .plot_summary,    .slug  ));
    constraint exclusive on (((.a,.b,.c)));
  }

  type User {
    required property username -> str;
    required multi link favourite_movies -> Movie;
  }

  type AdminUser extending User {
    overloaded required property username -> str {
      constraint exclusive;
    }
  }

  type MovieShape {
  }

  abstract type HasName {
    property name -> str;
  }
  abstract type HasAge {
    property age -> int64;
  }

  scalar type bag_seq extending sequence;

  type Bag extending HasName, HasAge {
    property secret_identity -> str;
    property genre -> Genre;
    property boolField -> bool;
    property datetimeField -> datetime;
    property localDateField -> cal::local_date;
    property localTimeField -> cal::local_time;
    property localDateTimeField -> cal::local_datetime;
    property durationField -> duration;
    property decimalField -> decimal;
    property int64Field -> int64;
    property int32Field -> int32;
    property int16Field -> int16;
    property float32Field -> float32;
    property float64Field -> float64;
    property bigintField -> bigint;
    required multi property stringsMulti -> str;
    property stringsArr -> array<str>;
    multi property stringMultiArr -> array<str>;
    property namedTuple -> tuple<x: str, y: int64>;
    property unnamedTuple -> tuple<str, int64>;
    property enumArr -> array<Genre>;
    property seqField -> bag_seq;
    property jsonField -> json;
    property arrTupleField -> array<tuple<str, int64>>;
    property rangeField -> range<int64>;
  }

  type Simple extending HasName, HasAge {}

  type W {
    property a -> str;
    property d -> float64;
  }
  type X {
    property a -> str;
    property b -> int32;
  }
  type Y {
    property a -> str;
    property c -> bool;
  }
  type Z {
    multi link xy -> W | X | Y;
  }

  # Unicode handling
  # https://github.com/geldata/gel/blob/master/tests/schemas/dump02_default.esdl

  abstract annotation `🍿`;

  abstract constraint `🚀🍿`(max: int64) extending max_len_value;

  function `💯`(NAMED ONLY `🙀`: int64) -> int64 {
      using (
          SELECT 100 - `🙀`
      );

      annotation `🍿` := 'fun!🚀';
      volatility := 'Immutable';
  }

  type `S p a M` {
      required property `🚀` -> int32;
      property c100 := (SELECT `💯`(`🙀` := .`🚀`));
  }

  type A {
      required link `s p A m 🤞` -> `S p a M`;
  }

  scalar type 你好 extending str;

  scalar type مرحبا extending 你好 {
      constraint `🚀🍿`(100);
  };

  scalar type `🚀🚀🚀` extending مرحبا;

  type Łukasz {
      required property `Ł🤞` -> `🚀🚀🚀` {
          default := <`🚀🚀🚀`>'你好🤞'
      }
      index on (.`Ł🤞`);

      link `Ł💯` -> A {
          property `🙀🚀🚀🚀🙀` -> `🚀🚀🚀`;
          property `🙀مرحبا🙀` -> مرحبا {
              constraint `🚀🍿`(200);
          }
      };
  }

  scalar type embedding extending ext::pgvector::vector<1234>;

  type PgVectorTest {
    test_embedding: embedding;
  }

  module nested {
    type Test {
      property prop: str;
    }
  }
};

module `💯💯💯` {
  function `🚀🙀🚀`(`🤞`: default::`🚀🚀🚀`) -> default::`🚀🚀🚀`
    using (
      SELECT <default::`🚀🚀🚀`>(`🤞` ++ 'Ł🙀')
    );

  type `🚀` {
    property `🙀` -> str;
  }
};

module extra {
  global user_id -> uuid;
}

module User {
  scalar type Status extending enum<"Active", "Disabled">;

  type User extending default::User;

  type Profile {
    link address -> User::Profile::MailingAddress;
  }

  module Profile {
    type MailingAddress {
      property street -> str;
      property city -> str;
      property state -> str;
      property zip -> str;
    }
  }
}

module `i.got.dots.doot` {
  type Test {
    property a: str;
  }
}
