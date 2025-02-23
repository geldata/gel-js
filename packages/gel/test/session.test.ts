import {
  Duration,
  DisabledCapabilityError,
  InvalidReferenceError,
} from "../src/index.node";
import { getClient, getGelVersion } from "./testbase";

if (getGelVersion().major >= 2) {
  test("with module", async () => {
    const client = getClient({ concurrency: 1 });

    await expect(client.query(`select get_version()`)).rejects.toThrowError(
      InvalidReferenceError,
    );

    await expect(
      client.withModuleAliases({ module: "sys" }).query(`select get_version()`),
    ).resolves.not.toThrow();

    // make sure session state was reset
    await expect(client.query(`select get_version()`)).rejects.toThrowError(
      InvalidReferenceError,
    );

    client.close();
  });

  test("withGlobals", async () => {
    const client = getClient({ concurrency: 1 });

    await client.execute(`
      create global userId -> uuid;
      create global currentTags -> array<str>;
      create required global reqTest -> str {
        set default := 'default value';
      };
      create global defaultTest -> str {
        set default := 'default value';
      };
      create module custom;
      create global custom::test -> str;
    `);

    try {
      expect(
        await client.querySingle(`select {
          userId := global userId,
          currentTags := global currentTags,
        }`),
      ).toEqual({ userId: null, currentTags: null });

      const clientWithUserId = client.withGlobals({
        userId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      expect(
        await clientWithUserId.querySingle(`select {
          userId := global userId,
          currentTags := global currentTags,
        }`),
      ).toEqual({
        userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        currentTags: null,
      });

      // make sure session state is reset
      expect(
        await client.querySingle(`select {
          userId := global userId,
          currentTags := global currentTags,
        }`),
      ).toEqual({ userId: null, currentTags: null });

      // check session state gets merged
      expect(
        await clientWithUserId.withGlobals({
          userId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          currentTags: ["a", "b", "c"],
        }).querySingle(`select {
          userId := global userId,
          currentTags := global currentTags,
        }`),
      ).toEqual({
        userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        currentTags: ["a", "b", "c"],
      });

      expect(
        await client.querySingle(`select (global reqTest, global defaultTest)`),
      ).toEqual(["default value", "default value"]);
      expect(
        await client
          .withGlobals({ reqTest: "abc", defaultTest: "def" })
          .querySingle(`select (global reqTest, global defaultTest)`),
      ).toEqual(["abc", "def"]);
      expect(
        await client
          .withGlobals({
            defaultTest: null,
          })
          .querySingle(`select global defaultTest`),
      ).toEqual(null);

      await expect(
        client.withGlobals({ unknownGlobal: 123 }).query("select 1"),
      ).rejects.toThrowError(/invalid global 'default::unknownGlobal'/);

      expect(
        client
          .withGlobals({ test: "abc" })
          .querySingle(`select global custom::test`),
      ).rejects.toThrowError(/invalid global 'default::test'/);

      expect(
        await client
          .withModuleAliases({ module: "custom" })
          .withGlobals({ test: "abc" })
          .querySingle(`select global custom::test`),
      ).toEqual("abc");
    } finally {
      await client.execute(`
        drop global userId;
        drop global currentTags;
        drop global custom::test;
      `);

      client.close();
    }
  }, 20_000);

  test("withConfig", async () => {
    const client = getClient({ concurrency: 1 });

    expect(
      (
        await client.queryRequiredSingle<Duration>(
          `select assert_single(cfg::Config.query_execution_timeout)`,
        )
      ).toString(),
    ).toEqual("PT0S");

    expect(
      (
        await client
          .withConfig({
            query_execution_timeout: Duration.from("PT30S"),
          })
          .queryRequiredSingle<Duration>(
            `select assert_single(cfg::Config.query_execution_timeout)`,
          )
      ).toString(),
    ).toEqual("PT30S");

    // make sure session state was reset
    expect(
      (
        await client.queryRequiredSingle<Duration>(
          `select assert_single(cfg::Config.query_execution_timeout)`,
        )
      ).toString(),
    ).toEqual("PT0S");

    client.close();
  });

  test("reject session commands", async () => {
    const client = getClient();

    await client.execute(`
    create global userId2 -> uuid;
  `);

    try {
      await expect(client.execute(`set module sys`)).rejects.toThrowError(
        DisabledCapabilityError,
      );

      await expect(
        client.execute(`set alias foo as module sys`),
      ).rejects.toThrowError(DisabledCapabilityError);

      await expect(
        client.execute(
          `configure session set query_execution_timeout := <duration>'PT30S'`,
        ),
      ).rejects.toThrowError(DisabledCapabilityError);

      await expect(
        client.execute(
          `set global userId2 := <uuid>"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`,
        ),
      ).rejects.toThrowError(DisabledCapabilityError);
    } finally {
      await client.execute(`drop global userId2`);

      client.close();
    }
  }, 50_000);
} else {
  test("legacy protocol", async () => {
    const client = getClient();

    await expect(
      client
        .withGlobals({ userId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
        .query("select 1"),
    ).rejects.toThrowError(
      /setting session state is not supported in this version of Gel/,
    );

    await expect(
      client.withModuleAliases({ module: "sys" }).query("select 1"),
    ).rejects.toThrowError(
      /setting session state is not supported in this version of Gel/,
    );

    await expect(
      client
        .withConfig({
          query_execution_timeout: Duration.from("PT30S"),
        })
        .query("select 1"),
    ).rejects.toThrowError(
      /setting session state is not supported in this version of Gel/,
    );
  });
}
