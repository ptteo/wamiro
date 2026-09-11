# GlitchTip (self-hosted error tracking)

Wamiro sends unhandled API 500s to GlitchTip when `GLITCHTIP_DSN` is set.
Unset DSN = journald only. Do not co-locate the full GlitchTip stack on a
2 GB box next to `next build`.

## One-time host

Preferred: extra database on the existing RDS + Redis + one GlitchTip
container (~256 MB web) on a 4 GB instance, or a tiny second VM.

```bash
# new empty database on RDS (example)
# CREATE DATABASE glitchtip;

# then follow GlitchTip's docker compose, pointing POSTGRES at that DB.
# Put Caddy in front:
# errors.example.com { reverse_proxy 127.0.0.1:8000 }
```

In the GlitchTip UI: create a project → copy the DSN.

## Wamiro `.env`

```
GLITCHTIP_DSN=https://<key>@errors.example.com/<project-id>
GLITCHTIP_RELEASE=wamiro@0.1.0+<git-sha>   # optional
GLITCHTIP_ENVIRONMENT=production
```

`sudo systemctl restart wamiro`

## Alerts

In GlitchTip: alert on new unresolved issues → email. Health probes
(`/api/v1/health*`) are never sent. Expected 4xx (`ApiError`) is never sent.
