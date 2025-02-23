import { ProtocolError } from "./errors";
import {
  decodeB64,
  encodeB64,
  utf8Decoder,
  utf8Encoder,
} from "./primitives/buffer";
import { getSCRAM } from "./scram";
import type { CryptoUtils } from "./utils";

const AUTH_ENDPOINT = "/auth/token";

export type HttpSCRAMAuth = (
  baseUrl: string,
  username: string,
  password: string,
) => Promise<string>;

export function getHTTPSCRAMAuth(cryptoUtils: CryptoUtils): HttpSCRAMAuth {
  const {
    bufferEquals,
    generateNonce,
    buildClientFirstMessage,
    buildClientFinalMessage,
    parseServerFirstMessage,
    parseServerFinalMessage,
  } = getSCRAM(cryptoUtils);

  return async function HTTPSCRAMAuth(
    baseUrl: string,
    username: string,
    password: string,
  ): Promise<string> {
    const authUrl = baseUrl + AUTH_ENDPOINT;
    const clientNonce = generateNonce();
    const [clientFirst, clientFirstBare] = buildClientFirstMessage(
      clientNonce,
      username,
    );

    const serverFirstRes = await fetch(authUrl, {
      headers: {
        Authorization: `SCRAM-SHA-256 data=${utf8ToB64(clientFirst)}`,
      },
    });

    // The first request must have status 401 Unauthorized and provide a
    // WWW-Authenticate header with a SCRAM-SHA-256 challenge.
    // See: https://github.com/geldata/gel/blob/09782afd3b759440abbb1b26ee19b6589be04275/edb/server/protocol/auth/scram.py#L153-L157
    const authenticateHeader = serverFirstRes.headers.get("WWW-Authenticate");
    if (serverFirstRes.status !== 401 || !authenticateHeader) {
      const body = await serverFirstRes.text();
      throw new ProtocolError(`authentication failed: ${body}`);
    }

    // WWW-Authenticate can contain multiple comma-separated authentication
    // schemes (each with own comma-separated parameter pairs), but we only support
    // one SCRAM-SHA-256 challenge, e.g., `SCRAM-SHA-256 sid=..., data=...`.
    if (!authenticateHeader.startsWith("SCRAM-SHA-256")) {
      throw new ProtocolError(
        `unsupported authentication scheme: ${authenticateHeader}`,
      );
    }

    // The server may respond with a 401 Unauthorized and `WWW-Authenticate: SCRAM-SHA-256` with
    // no parameters if authentication fails, e.g., due to an incorrect username.
    // See: https://github.com/geldata/gel/blob/09782afd3b759440abbb1b26ee19b6589be04275/edb/server/protocol/auth/scram.py#L112-L120
    const authParams = authenticateHeader.split(/ (.+)?/, 2)[1] ?? "";
    if (authParams.length === 0) {
      const body = await serverFirstRes.text();

      throw new ProtocolError(`authentication failed: ${body}`);
    }

    const { sid, data: serverFirst } = parseScramAttrs(authParams);
    if (!sid || !serverFirst) {
      throw new ProtocolError(
        `authentication challenge missing attributes: expected "sid" and "data", got '${authParams}'`,
      );
    }

    const [serverNonce, salt, iterCount] = parseServerFirstMessage(serverFirst);
    const [clientFinal, expectedServerSig] = await buildClientFinalMessage(
      password,
      salt,
      iterCount,
      clientFirstBare,
      serverFirst,
      serverNonce,
    );

    const serverFinalRes = await fetch(authUrl, {
      headers: {
        Authorization: `SCRAM-SHA-256 sid=${sid}, data=${utf8ToB64(
          clientFinal,
        )}`,
      },
    });

    // The second request is successful if the server responds with a 200 and an
    // Authentication-Info header (see https://datatracker.ietf.org/doc/html/rfc7615#section-3).
    // See: https://github.com/geldata/gel/blob/09782afd3b759440abbb1b26ee19b6589be04275/edb/server/protocol/auth/scram.py#L252-L254
    const authInfoHeader = serverFinalRes.headers.get("Authentication-Info");

    if (!serverFinalRes.ok || !authInfoHeader) {
      const body = await serverFinalRes.text();
      throw new ProtocolError(`authentication failed: ${body}`);
    }

    const { data: serverFinal, sid: sidFinal } =
      parseScramAttrs(authInfoHeader);
    if (!sidFinal || !serverFinal) {
      throw new ProtocolError(
        `authentication info missing attributes: expected "sid" and "data", got '${authInfoHeader}'`,
      );
    }

    if (sidFinal !== sid) {
      throw new ProtocolError("SCRAM session id does not match");
    }

    const serverSig = parseServerFinalMessage(serverFinal);
    if (!bufferEquals(serverSig, expectedServerSig)) {
      throw new ProtocolError("server SCRAM proof does not match");
    }

    const authToken = await serverFinalRes.text();
    return authToken;
  };
}

function utf8ToB64(str: string): string {
  return encodeB64(utf8Encoder.encode(str));
}

function b64ToUtf8(str: string): string {
  return utf8Decoder.decode(decodeB64(str));
}

function parseScramAttrs(paramsStr: string): {
  sid: string | null;
  data: string | null;
} {
  const params = new Map(
    paramsStr.length > 0
      ? paramsStr
          .split(",")
          .map((attr) => attr.split(/=(.+)?/, 2)) // split on first '=' only; nb, `.split("=", 2)` doesn't do that
          .map(([key, val]) => [key.trim(), val.trim()])
      : [],
  );

  const sid = params.get("sid") ?? null;
  const rawData = params.get("data");
  const data = rawData ? b64ToUtf8(rawData) : null;

  return { sid, data };
}
