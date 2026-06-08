# Clue auth email templates

`signin-code.html` is the branded email that delivers the 6-digit sign-in code.

## Critical: paste it into BOTH templates

The app signs in with `signInWithOtp` + `verifyOtp` (a typed 6-digit code, never a
link — see `app.js`). The email therefore MUST contain `{{ .Token }}`. Supabase
chooses the template by event:

- **Confirm signup** — sent to *first-time* users. It ships as a link-only default
  (`{{ .ConfirmationURL }}`) with no code, which silently breaks new signups (you get
  a "Confirm your email address" link instead of a code). **Overwrite it with
  `signin-code.html`.**
- **Magic Link** — sent to *returning* logins. Overwrite it too.

Dashboard: **Authentication → Email Templates** → paste `signin-code.html` into both,
then Save.

## Logo

Uses `icon-email.png` (80×80, ~4 KB), an email-sized copy of `icon-1024.png`, served
from GitHub Pages at `https://o-frings.github.io/clue/icon-email.png`. Regenerate with:

    sips -Z 80 icon-1024.png --out icon-email.png

Notes:
- Supabase's preview pane does **not** load remote images — send a real test email to
  see the logo. The orange `#e8551c` cell behind it is a fallback so a blocked image
  still looks on-brand.
- Colours match the app: accent `#e8551c`, background `#f2f2f7`.
