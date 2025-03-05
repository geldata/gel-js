CREATE MIGRATION m1saaenwdwhe4ww5jy34gkdo2tuigheb4rub5frv4o2y3tnjkbqseq
    ONTO m1cigpnllpzucl3lckxtsfnozf6zbyagfakqal7ejkc3sd2ocj4efa
{
  CREATE MODULE `i.got.dots.doot` IF NOT EXISTS;
  CREATE TYPE `i.got.dots.doot`::Test {
      CREATE PROPERTY a: std::str;
  };
};
