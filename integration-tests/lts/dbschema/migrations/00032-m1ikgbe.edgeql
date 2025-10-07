CREATE MIGRATION m1ikgbe45h3cygjmuxh3ze5rs5d66cqqcq2armmep3r3mjpgezca2a
    ONTO m1hbukk7q7j6plwsmgronpimcotrc3uq2i457xronjbre6dt6ie23q
{
  ALTER ABSTRACT LINK default::movie_character {
      CREATE PROPERTY meta: std::json;
  };
  ALTER TYPE default::Profile {
      CREATE PROPERTY d: std::json;
  };
};
