import * as errors from "./errors";

export async function requestGET<ResponseT>(
  href: string,
  searchParams?: Record<string, string>,
  onFailure?: (errorMessage: string) => Promise<ResponseT>,
): Promise<ResponseT> {
  const url = new URL(href);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.append(key, value);
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const bodyText = await response.text();
      if (onFailure) {
        return onFailure(bodyText);
      }
      throw decodeError(bodyText);
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }

    return response.text() as ResponseT;
  } catch (err) {
    if (onFailure) {
      return onFailure((err as Error).message);
    }
    throw err;
  }
}

export async function requestPOST<ResponseT>(
  href: string,
  body?: object,
  onFailure?: (errorMessage: string) => Promise<ResponseT>,
): Promise<ResponseT> {
  try {
    const response = await fetch(href, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      ...(body != null
        ? {
            body: JSON.stringify(body),
          }
        : undefined),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      if (onFailure) {
        return onFailure(bodyText);
      }
      throw decodeError(bodyText);
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }
    return response.text() as ResponseT;
  } catch (err) {
    if (onFailure) {
      return onFailure((err as Error).message);
    }
    throw err;
  }
}

export const errorMapping = new Map(
  Object.values(errors)
    .map((errClass) =>
      "type" in errClass.prototype ? [errClass.prototype.type, errClass] : null,
    )
    .filter((entry) => entry != null) as unknown as [
    string,
    errors.GelAuthError,
  ][],
);

export function decodeError(errorBody: string): errors.GelAuthError {
  try {
    const errorJson = JSON.parse(errorBody);
    if (
      typeof errorJson !== "object" ||
      !errorJson["error"] ||
      typeof errorJson["error"] !== "object"
    ) {
      return new errors.UnknownError(
        `Error returned by server does not contain 'error' object`,
      );
    }
    const error = errorJson["error"];
    if (
      !("type" in error && "message" in error) ||
      typeof error["type"] !== "string" ||
      typeof error["message"] !== "string"
    ) {
      return new errors.UnknownError(
        `Error object returned by server does not contain 'type' or 'message'`,
      );
    }
    const errorClass = errorMapping.get(error.type);
    if (!errorClass) {
      return new errors.UnknownError(`Unknown error type: '${error.type}'`);
    }
    return new (errorClass as any)(error["message"]);
  } catch {
    return new errors.UnknownError(`Failed to decode error json: ${errorBody}`);
  }
}
