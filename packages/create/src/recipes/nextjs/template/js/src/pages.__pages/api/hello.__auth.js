// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { auth } from "@/gel";

export default async function handler(req, res) {
  const session = auth.getSession(req);
  const identity = await session.client.querySingle(
    `select global ext::auth::ClientTokenIdentity {*}`,
  );

  res.status(200).json({ name: "John Doe", identity });
}
