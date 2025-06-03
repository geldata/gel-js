CREATE MIGRATION m1hbukk7q7j6plwsmgronpimcotrc3uq2i457xronjbre6dt6ie23q
    ONTO m14ccrzhfjulgoy3mdub7s7cfw5neuoxawxlwos2efvwv2si66mbka
{
  CREATE TYPE default::Director {
      CREATE REQUIRED PROPERTY name: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
  ALTER TYPE default::Movie {
      CREATE MULTI LINK directors: default::Director;
  };
};
