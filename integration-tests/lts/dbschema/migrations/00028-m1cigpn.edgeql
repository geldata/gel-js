CREATE MIGRATION m1cigpnllpzucl3lckxtsfnozf6zbyagfakqal7ejkc3sd2ocj4efa
    ONTO m173ddshjvgy5ampp7rzi2g7cwwdkaljvlifemr5vugnkimtbpp6ca
{
  ALTER TYPE default::Hero {
      ALTER PROPERTY number_of_movies {
          SET default := 0;
          SET REQUIRED USING (0);
      };
  };
};
