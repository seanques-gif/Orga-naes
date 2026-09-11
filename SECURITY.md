# Security Policy

## Reporting a vulnerability

Please use GitHub's **private security advisory** feature ("Report a vulnerability"
on the Security tab) rather than a public issue. Include reproduction steps and the
affected commit if possible.

## Supported versions

Only the latest commit on `main` is supported.

## Scope notes

This is a single-file, client-side application. Things worth knowing before reporting:

- **Data locality** — all app data lives in the user's own browser
  (localStorage + IndexedDB). There is no server and no user database controlled by
  this repository.
- **Firebase web config** — the Firebase API key and project URLs in the source are
  public client configuration, not secrets. They are safe to publish and must not be
  obfuscated. Real access control lives in the Firebase Realtime Database security
  rules; reports about rule misconfiguration (e.g. world-readable user data paths)
  are in scope.
- **Cloud sync is opt-in** — with sync disabled, the app performs no network calls
  except optional font/icon CDN fetches, and the service worker update check.
- **Backup import is trusted input** — importing a JSON backup executes nothing, but
  its strings are rendered into the UI. A crafted backup can only affect the person
  who chose to import it (self-XSS scope). Defense-in-depth fixes here are welcome.
- **Content Security Policy** is not currently set; reports suggesting a CSP that
  works with the inline single-file architecture are in scope.

## Out of scope

- The public nature of the Firebase web configuration itself
- Issues requiring physical access to an unlocked device
- Missing rate limiting or abuse of the optional Firebase backend quota
