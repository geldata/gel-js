CREATE MIGRATION m1xym4iizk6uca3j6edxwxofb3z2ryclmnapjj24apuap2beaqd47a
    ONTO initial
{
  CREATE EXTENSION pgcrypto VERSION '1.3';
  CREATE EXTENSION auth VERSION '1.0';
  CREATE TYPE default::Documentary {
      CREATE REQUIRED PROPERTY title: std::str;
      CREATE REQUIRED PROPERTY plot: std::str;
  };
  CREATE ABSTRACT TYPE default::Content {
      CREATE REQUIRED PROPERTY title: std::str;
      CREATE REQUIRED PROPERTY year: std::int16;
  };
  CREATE TYPE default::Movie EXTENDING default::Content {
      CREATE REQUIRED PROPERTY plot: std::str;
  };
  CREATE TYPE default::Show EXTENDING default::Content {
      CREATE REQUIRED PROPERTY seasons: std::int16;
  };
  CREATE TYPE default::User {
      CREATE MULTI LINK documentaries: default::Documentary;
      CREATE MULTI LINK movies: default::Movie;
      CREATE MULTI LINK shows: default::Show;
      CREATE MULTI LINK all_media := (SELECT
          ((.movies UNION .shows) UNION .documentaries)
      );
      CREATE MULTI LINK watching_list := (SELECT
          (.movies UNION .shows)
      ORDER BY
          .year ASC
      );
      CREATE LINK identity: ext::auth::Identity;
  };
  CREATE TYPE default::CryptoTest {
      CREATE PROPERTY hash_sha256: std::bytes;
  };
  CREATE TYPE default::Post {
      CREATE REQUIRED PROPERTY text: std::str;
      CREATE INDEX fts::index ON (fts::with_options(.text, language := fts::Language.eng));
  };
  CREATE TYPE default::WithMultiRange {
      CREATE REQUIRED PROPERTY ranges: multirange<std::int32>;
  };
};
