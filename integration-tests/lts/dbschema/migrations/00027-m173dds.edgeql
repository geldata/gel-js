CREATE MIGRATION m173ddshjvgy5ampp7rzi2g7cwwdkaljvlifemr5vugnkimtbpp6ca
    ONTO m1wb2dgjeppqex272zwvqnsdfzdvvppub4iwa5vaxu3xxigyjlruka
{
  CREATE ABSTRACT TYPE default::LivingThing {
      CREATE PROPERTY age: std::int32;
  };
  ALTER TYPE default::Person EXTENDING default::LivingThing LAST;
};
