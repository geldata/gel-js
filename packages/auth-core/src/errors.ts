/** Base class for all exceptions raised by the auth extension. */
export class GelAuthError extends Error {
  get type() {
    return "_GelAuth";
  }
}

/** Error returned by auth extension could not be decoded into a
 * known error class.
 */
export class UnknownError extends GelAuthError {
  get type() {
    return "_Unknown";
  }
}

/** Base class for all backend auth extension errors. It is not recommended to
 * return these errors to the user.
 */
export class BackendError extends GelAuthError {
  get type() {
    return "_Backend";
  }
}

/** Base class for all errors arising during normal use of the auth extension.
 * These errors are considered safe to return to the user.
 */
export class UserError extends GelAuthError {
  get type() {
    return "_User";
  }
}

/** Required resource could not be found. */
export class NotFoundError extends GelAuthError {
  get type() {
    return "NotFound";
  }
}

/** Error in auth extension configuration. */
export class ConfigurationError extends BackendError {
  get type() {
    return "_Configuration";
  }
}

/** Required configuration is missing. */
export class MissingConfigurationError extends ConfigurationError {
  get type() {
    return "MissingConfiguration";
  }
}

/** Data received from the auth provider is invalid. */
export class MisconfiguredProviderError extends ConfigurationError {
  get type() {
    return "MisconfiguredProvider";
  }
}

/** Data received from the client is invalid. */
export class InvalidDataError extends UserError {
  get type() {
    return "InvalidData";
  }
}

/** Could not find a matching identity. */
export class NoIdentityFoundError extends UserError {
  get type() {
    return "NoIdentityFound";
  }
}

/** Attempt to register an already registered handle. */
export class UserAlreadyRegisteredError extends UserError {
  get type() {
    return "UserAlreadyRegistered";
  }
}

/** OAuth Provider returned a non-success for some part of the flow. */
export class OAuthProviderFailureError extends UserError {
  get type() {
    return "OAuthProviderFailure";
  }
}

/** Magic link flow failed. */
export class MagicLinkFailureError extends UserError {
  get type() {
    return "MagicLinkFailure";
  }
}

/** Error with email verification. */
export class VerificationError extends UserError {
  get type() {
    return "_Verification";
  }
}

/** Email verification token has expired. */
export class VerificationTokenExpiredError extends VerificationError {
  get type() {
    return "VerificationTokenExpired";
  }
}

/** Email verification is required. */
export class VerificationRequiredError extends VerificationError {
  get type() {
    return "VerificationRequired";
  }
}

/** Error during PKCE flow. */
export class PKCEError extends UserError {
  get type() {
    return "_PKCE";
  }
}

/** Failed to create a valid PKCEChallenge object. */
export class PKCECreationFailedError extends PKCEError {
  get type() {
    return "PKCECreationFailed";
  }
}

/** Verifier and challenge do not match. */
export class PKCEVerificationFailedError extends PKCEError {
  get type() {
    return "PKCEVerificationFailed";
  }
}

/** WebAuthn authentication failed. */
export class WebAuthnAuthenticationFailedError extends UserError {
  get type() {
    return "WebAuthnAuthenticationFailed";
  }
}

/** WebAuthn registration failed. */
export class WebAuthnRegistrationFailedError extends UserError {
  get type() {
    return "WebAuthnRegistrationFailed";
  }
}
