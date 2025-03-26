import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import auth, { client } from "~/services/auth.server";
import clientAuth from "~/services/auth";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = auth.getSession(request);
  const isSignedIn = await session.isSignedIn();

  const builtinUIEnabled = await client.queryRequiredSingle<boolean>(
    `select exists ext::auth::UIConfig`,
  );

  return json({
    isSignedIn,
    builtinUIEnabled,
  });
};

export default function Index() {
  const { isSignedIn, builtinUIEnabled } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Welcome to Remix</h1>
      {isSignedIn ? (
        <p>
          You are signed in. <a href={clientAuth.getSignoutUrl()}>Sign Out</a>
        </p>
      ) : (
        <>
          <p> You are not signed in. </p>
          <a href={clientAuth.getBuiltinUIUrl()}>Sign In with Builtin UI</a>
          {!builtinUIEnabled && (
            <p>
              In order to signin you need to firstly enable the built-in UI in
              the auth config.
            </p>
          )}
        </>
      )}

      <ul>
        <li>
          <a
            target="_blank"
            href="https://remix.run/tutorials/blog"
            rel="noreferrer"
          >
            15m Quickstart Blog Tutorial
          </a>
        </li>
        <li>
          <a
            target="_blank"
            href="https://remix.run/tutorials/jokes"
            rel="noreferrer"
          >
            Deep Dive Jokes App Tutorial
          </a>
        </li>
        <li>
          <a target="_blank" href="https://remix.run/docs" rel="noreferrer">
            Remix Docs
          </a>
        </li>
      </ul>
    </div>
  );
}
