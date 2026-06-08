# Clue — auth email (custom SMTP)

Supabase's built-in mailer is test-grade: rate-limited (a few/hour) and spam-prone. For
real sign-ins you point Supabase at a custom SMTP provider. Clue uses the **same setup as
Yalla: Mailjet**, with a validated sender. You can reuse Yalla's Mailjet account — the
relay doesn't care which app or which Supabase project uses it.

## 1. Mailjet side (one time)

- Use your existing Mailjet account (the one Yalla uses).
- Confirm a **validated sender** exists — Yalla uses `yalla.support@proton.me`. You can
  reuse that for Clue, or validate a Clue-specific address. Mailjet → **Senders & Domains**.
  Ideally the sending domain has **SPF + DKIM** set, or Gmail/others spam-file it.
- Get the SMTP credentials: Mailjet → **Account settings → SMTP / REST API → API Key
  Management**. You need the **API Key** and the **Secret Key** (same pair Yalla uses).

## 2. Supabase side — Clue project (giupopvtpthqnidagfsi)

**Authentication → Emails → SMTP Settings → Enable Custom SMTP**, then:

| Field          | Value                                            |
|----------------|--------------------------------------------------|
| Sender email   | your validated Mailjet sender (e.g. `yalla.support@proton.me`) |
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

## Debugging a missing email (Yalla's playbook)

1. **Mailjet → Messaging / Statistics.** If the message isn't there, Supabase never sent
   it → template render error or the Supabase auth rate limit (step 3). If it's there but
   `blocked`/`bounced`/`spam`, it's a delivery problem (step 2 below).
2. **Recipient suppressed.** After repeated test sends, Mailjet may blocklist the address.
   Mailjet → **Contacts → Blocklist / Exclusion list** → remove it. Check the sender is
   still validated and the account isn't over quota.
3. **Check spam/junk** on the receiving side before assuming it never sent.
