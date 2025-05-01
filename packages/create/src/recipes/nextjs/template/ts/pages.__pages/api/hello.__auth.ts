// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import { auth } from "@/gel";

interface Data {
  name: string;
  identity: any;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  const session = auth.getSession(req);
  const identity = await session.client.querySingle(
    `select global ext::auth::ClientTokenIdentity {*}`,
  );

  res.status(200).json({ name: "John Doe", identity });
}
