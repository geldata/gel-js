CREATE MIGRATION m1b5kogggyycxixgy2mcrqu3ntk3hhagdcospowiernk6ddu6op6ia
    ONTO initial
{
  CREATE ABSTRACT TYPE default::Named {
      CREATE REQUIRED PROPERTY name: std::str;
  };
  CREATE TYPE default::User EXTENDING default::Named;
  CREATE TYPE default::GameSession {
      CREATE MULTI LINK players: default::User {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE REQUIRED PROPERTY num: std::int32;
  };
  CREATE TYPE default::UserGroup EXTENDING default::Named {
      CREATE MULTI LINK users: default::User;
  };
  CREATE TYPE default::Post {
      CREATE REQUIRED LINK author: default::User;
      CREATE REQUIRED PROPERTY body: std::str;
  };
};
