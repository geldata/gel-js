CREATE MIGRATION m1l3ekcdknbfrm2zn5gucofoh7pyt5uxnbeoze7kkmlfp7b7nr3ira
    ONTO m1b5kogggyycxixgy2mcrqu3ntk3hhagdcospowiernk6ddu6op6ia
{
  CREATE TYPE default::AssortedScalars {
      CREATE PROPERTY bstr: std::bytes;
      CREATE REQUIRED PROPERTY name: std::str;
      CREATE PROPERTY ts: std::datetime;
      CREATE PROPERTY vals: array<std::str>;
  };
};
