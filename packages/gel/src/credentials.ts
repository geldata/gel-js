import {
  type ServerUtils,
  type TlsSecurity,
  validTlsSecurityValues,
} from "./conUtils";

import { InterfaceError } from "./errors";

export interface Credentials {
  host?: string;
  port?: number;
  user: string;
  password?: string;
  database?: string;
  branch?: string;
  tlsCAData?: string;
  tlsSecurity?: TlsSecurity;
}

export async function getCredentialsPath(
  instanceName: string,
  serverUtils: ServerUtils,
): Promise<string> {
  return serverUtils.searchConfigDir("credentials", instanceName + ".json");
}

export async function readCredentialsFile(
  file: string,
  serverUtils: ServerUtils,
): Promise<Credentials> {
  try {
    const data: string = await serverUtils.readFileUtf8(file);
    return validateCredentials(JSON.parse(data));
  } catch (e) {
    throw new InterfaceError(`cannot read credentials file ${file}: ${e}`);
  }
}

export function validateCredentials(data: any): Credentials {
  const port = data.port;
  if (port != null && (typeof port !== "number" || port < 1 || port > 65535)) {
    throw new InterfaceError("invalid `port` value");
  }

  const user = data.user;
  if (user == null) {
    throw new InterfaceError("`user` key is required");
  }
  if (typeof user !== "string") {
    throw new InterfaceError("`user` must be string");
  }

  const result: Credentials = { user, port };

  const host = data.host;
  if (host != null) {
    if (typeof host !== "string") {
      throw new InterfaceError("`host` must be string");
    }
    result.host = host;
  }

  const database = data.database;
  if (database != null) {
    if (typeof database !== "string") {
      throw new InterfaceError("`database` must be string");
    }
    result.database = database;
  }

  const branch = data.branch;
  if (branch != null) {
    if (typeof branch !== "string") {
      throw new InterfaceError("`branch` must be string");
    }
    if (database != null && branch !== database) {
      throw new InterfaceError("`database` and `branch` cannot both be set");
    }
    result.branch = branch;
  }

  const password = data.password;
  if (password != null) {
    if (typeof password !== "string") {
      throw new InterfaceError("`password` must be string");
    }
    result.password = password;
  }

  const caData = data.tls_ca;
  if (caData != null) {
    if (typeof caData !== "string") {
      throw new InterfaceError("`tls_ca` must be string");
    }
    result.tlsCAData = caData;
  }

  const certData = data.tls_cert_data;
  if (certData != null) {
    if (typeof certData !== "string") {
      throw new InterfaceError("`tls_cert_data` must be string");
    }
    if (caData != null && certData !== caData) {
      throw new InterfaceError(
        `both 'tls_ca' and 'tls_cert_data' are defined, ` +
          `and are not in agreement`,
      );
    }
    result.tlsCAData = certData;
  }

  let verifyHostname = data.tls_verify_hostname;
  const tlsSecurity = data.tls_security;
  if (verifyHostname != null) {
    if (typeof verifyHostname === "boolean") {
      verifyHostname = verifyHostname ? "strict" : "no_host_verification";
    } else {
      throw new InterfaceError("`tls_verify_hostname` must be boolean");
    }
  }
  if (
    tlsSecurity != null &&
    (typeof tlsSecurity !== "string" ||
      !validTlsSecurityValues.includes(tlsSecurity as any))
  ) {
    throw new InterfaceError(
      `\`tls_security\` must be one of ${validTlsSecurityValues
        .map((val) => `"${val}"`)
        .join(", ")}`,
    );
  }
  if (
    verifyHostname &&
    tlsSecurity &&
    verifyHostname !== tlsSecurity &&
    !(verifyHostname === "no_host_verification" && tlsSecurity === "insecure")
  ) {
    throw new InterfaceError(
      `both 'tls_security' and 'tls_verify_hostname' are defined, ` +
        `and are not in agreement`,
    );
  }
  if (tlsSecurity || verifyHostname) {
    result.tlsSecurity = tlsSecurity ?? verifyHostname;
  }

  return result;
}
