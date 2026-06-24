# Clue — auth email (custom SMTP)

Supabase's built-in mailer is test-grade: rate-limited (a few/hour) and spam-prone. For
real sign-ins you point Supabase at a custom SMTP provider. Clue uses **Mailjet**, on its
**own independent account** (separate from Yalla's — the two do not share credentials).

## 1. Mailjet side (one time)

- Use Clue's own Mailjet account.
- **Authenticate a sending domain you own (SPF + DKIM)** in Mailjet → **Senders & Domains**,
  and send from an address on it. This matters more than it looks: a *new* account sending
  one-time sign-in **codes** from an *unauthenticated* sender (e.g. a bare `@proton.me`) looks
  like phishing to Mailjet's risk model and gets the account auto-suspended — even at tiny
  volume (it happened here at 7 total sends). A validated single-sender address works for
  testing, but authenticate the domain before real use.
- Get the SMTP credentials: Mailjet → **Account settings → SMTP / REST API → API Key
  Management**. You need the **API Key** (SMTP username) and the **Secret Key** (SMTP
  password) — these are *not* your Mailjet login email/password.

## 2. Supabase side — Clue project (giupopvtpthqnidagfsi)

**Authentication → Emails → SMTP Settings → Enable Custom SMTP**, then:

| Field          | Value                                            |
|----------------|--------------------------------------------------|
| Sender email   | your validated Mailjet sender, **matched exactly** (ideally on a domain you've SPF/DKIM-authenticated) |
| Sender name    | `Clue`                                           |
| Host           | `in-v3.mailjet.com`                              |
| Port           | `587`                                            |
| Username       | Mailjet **API Key**                              |
| Password       | Mailjet **Secret Key**                           |

These secrets live **only** in the Supabase dashboard — never commit them to the repo.

## 3. Rate limit (matters even with custom SMTP)

**Authentication → Rate Limits → "emails sent per hour"** still applies before Supabase
ever calls Mailjet. Lots of test sends trip it; raise it or wait an hour.

## 4. Templates

The email must carry the 6-digit code, not a link — paste
[`supabase/email-templates/signin-code.html`](supabase/email-templates/signin-code.html)
into **both** *Confirm signup* and *Magic Link* (see that folder's README).

**Email OTP Length must be 6.** Authentication → Providers → Email → **Email OTP Length**
has to match the app, which expects 6 digits (the code input and the template both say
"6-digit code"). If it's set higher (e.g. 8), the email carries an 8-digit code the input
can't fully accept, so *every* sign-in fails with "token has expired or is invalid" even
though the code is fresh and correct. The app input now accepts up to 8 as a safeguard,
but keep the setting at 6.

## Debugging a missing email (Yalla's playbook)

1. **Mailjet → Messaging / Statistics.** If the message isn't there, Supabase never sent
   it → template render error or the Supabase auth rate limit (step 3). If it's there but
   `blocked`/`bounced`/`spam`, it's a delivery problem (step 2 below).
2. **Recipient suppressed.** After repeated test sends, Mailjet may blocklist the address.
   Mailjet → **Contacts → Blocklist / Exclusion list** → remove it. Check the sender is
   still validated and the account isn't over quota.
3. **Check spam/junk** on the receiving side before assuming it never sent.
