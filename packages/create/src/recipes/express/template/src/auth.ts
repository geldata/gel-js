import { type NextFunction, type Response, Router } from "express";
import createExpressAuth, {
  type AuthRequest,
  type CallbackRequest,
} from "@gel/auth-express";
import { client } from "./db.js";
import { PORT } from "./env.js";

export const auth = createExpressAuth(client, {
  baseUrl: `http://localhost:${PORT}`,
});

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!(await req.session?.isSignedIn())) {
    res.redirect("/signin");
  } else {
    next();
  }
};

/************
 * Sign Out *
 ************/

export const signoutRoute = Router().get(
  "/",
  auth.signout,
  async (_: AuthRequest, res: Response) => {
    res.redirect("/");
  },
);

/***************
 * Built-in UI *
 ***************/

const builtinCallback = async (req: CallbackRequest, res: Response) => {
  if (req.isSignUp) {
    return res.redirect("/onboarding");
  }

  res.redirect("/");
};

export const builtinUIRouter = auth.createBuiltinRouter({
  callback: [builtinCallback],
});
