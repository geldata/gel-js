# @gel/auth-core: Core helper library for the Gel Auth extension

This library contains some low-level utilities to help working with the Gel auth extension; namely resolving the api endpoint urls from an gel `Client` object, providing wrappers around those api's to help handle the various auth flows (including handling PKCE), and adding typesafety.

It is recommended to instead use the separate helper libraries created to make integration with popular frameworks as easy as possible. Currently supported frameworks:

- Next.js (@gel/auth-nextjs)
- _...more coming soon_
