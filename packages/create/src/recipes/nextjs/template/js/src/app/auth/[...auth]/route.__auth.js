import { redirect } from "next/navigation";
import { auth } from "@/gel";

export const { GET, POST } = auth.createAuthRouteHandlers({
  async onBuiltinUICallback({ error, tokenData, provider, isSignUp }) {
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
