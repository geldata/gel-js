import { redirect } from "next/navigation";
import { auth } from "@/gel";
import type { TokenData } from "@gel/auth-core";

export const { GET, POST } = auth.createAuthRouteHandlers({
  async onBuiltinUICallback({
    error,
    tokenData,
    isSignUp,
  }: {
    error?: Error;
    tokenData?: TokenData;
    isSignUp?: boolean;
  }) {
    if (error) {
      console.error("sign in failed", error);
    }
    if (!tokenData) {
      console.log("email verification required");
    }
    if (isSignUp) {
      console.log("new sign up");
    }
    redirect("/");
  },
  onSignout() {
    redirect("/");
  },
});
