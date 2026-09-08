# SMTP and DNS (SPF / DKIM / DMARC)

Wamiro sends mail through `SMTP_URL` (nodemailer). There is no Brevo SDK or other vendor lock-in. Point `SMTP_URL` at any SMTP relay you control — the same box, a provider’s SMTP endpoint, or a local relay.

## Environment

```
SMTP_URL=smtps://user:pass@smtp.example.com:465
MAIL_FROM=Wamiro <noreply@your-domain.example>
APP_URL=https://app.your-domain.example
```

If `SMTP_URL` is unset, the product still writes in-app notifications. Invite links appear on-screen so you can copy them.

## DNS records (on the From domain)

Publish these on the domain in `MAIL_FROM` so receiving servers accept the mail.

### SPF

Authorize the hosts that submit mail:

```
your-domain.example.  TXT  "v=spf1 include:_spf.your-relay.example -all"
```

Use `include:` for a hosted relay, or `ip4:` / `ip6:` for your own MTA. End with `-all` once you know the full sender set.

### DKIM

Sign with the selector your relay documents (often `default` or a provider-specific name):

```
default._domainkey.your-domain.example.  TXT  "v=DKIM1; k=rsa; p=..."
```

The public key comes from the SMTP provider or `opendkim-genkey` if you run the MTA.

### DMARC

Start with monitoring, then tighten:

```
_dmarc.your-domain.example.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@your-domain.example"
```

Move `p=quarantine` then `p=reject` after SPF + DKIM align for a few weeks.

## Quiet hours and digest

Users set email kinds, weekly digest, and quiet hours under Security. `deliverEmail` skips SMTP when a kind is off or the clock is inside quiet hours; the in-app row is always written. The `email_digest` job (hourly tick, weekly per user) sends one branded summary of unread notifications.

## Checklist

- [ ] `SMTP_URL` and `MAIL_FROM` set in the app environment
- [ ] SPF covers the submitting host
- [ ] DKIM selector published and signing
- [ ] DMARC record exists (`p=none` is enough to start)
- [ ] Send a test invite and confirm it lands (not spam)
