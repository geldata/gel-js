import * as tc from "conditional-type-checks";

import type {
  Movie,
  W,
  X,
  Y,
  Z,
  User,
  nested,
  $default,
} from "./dbschema/interfaces";

export type Genre =
  | "Horror"
  | "Action"
  | "RomCom"
  | "Science Fiction"
  | "Select";

export interface BaseObject {
  id: string;
}
export interface test_Person extends BaseObject {
  name: string;
  age?: number | null;
  height?: string | null;
  isAdult?: boolean | null;
}
export interface test_Movie extends BaseObject {
  characters: test_Person[];
  profile?: test_Profile | null;
  genre?: Genre | null;
  rating?: number | null;
  release_year: number;
  title: string;
}
export interface test_Profile extends BaseObject {
  plot_summary?: string | null;
  slug?: string | null;
  a?: string | null;
  b?: string | null;
  c?: string | null;
}
interface test_Z extends BaseObject {
  xy?: W | X | Y | null;
}
interface test_User extends BaseObject {
  username: string;
  favourite_movies: Movie[];
}

describe("interfaces", () => {
  test("check generated interfaces", () => {
    tc.assert<tc.IsExact<Movie, test_Movie>>(true);
    tc.assert<tc.IsExact<Z, test_Z>>(true);

    // default module export
    tc.assert<tc.IsExact<$default.Movie, Movie>>(true);

    // test overlapping namespaces
    // default::User type
    tc.assert<tc.IsExact<User, test_User>>(true);
    // user module
    tc.assert<tc.IsExact<User.Status, "Active" | "Disabled">>(true);
    tc.assert<tc.IsExact<User.User, User>>(true);

    // module nested in default module
    tc.assert<tc.IsExact<nested.Test["prop"], string | null | undefined>>(true);
  });
});
