// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

import type { ServerRequestAuth } from "@gel/auth-sveltekit/server";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth: ServerRequestAuth;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
