# Deploying web-habit-tracker on the NAS

The NAS pulls a ready-built image. Source code does not need to live on the NAS.

## One-time setup

1. Create an application folder such as `appdata/web-habit-tracker/`.
2. Copy `docker-compose.nas.yml` into it.
3. Create a `data/` directory and make it writable by container user `1000:1000`.
4. Define `TZ` in the NAS Compose environment using an IANA name, for example `Europe/Warsaw`. If omitted, Compose defaults to `Europe/Warsaw`.
5. Start the stack in OpenMediaVault Compose.
6. Open `http://<nas-tailscale-name-or-ip>:8000` from a device connected to the tailnet.

The `TZ` setting defines the habit tracker's day for every browser. Changing the phone or computer's local timezone does not change when the app considers a new day to have started.

## Updates

Pushes to `master` test the project and publish `ghcr.io/mktahmasbi99/web-habit-tracker:latest`. In OpenMediaVault Compose, pull the latest image and recreate the container. The bind-mounted `data/` directory remains unchanged.

After the first GitHub Actions publish, ensure the GHCR package visibility is Public so the NAS can pull without registry credentials. If it remains private, authenticate Docker to `ghcr.io` with a token that has `read:packages`.

## Backups

Back up the entire `data/` directory with the normal NAS backup system. The app additionally writes pre-import safety copies under `data/backups/`. Do not edit or copy a live SQLite file while it is being written; stop the container or use a filesystem snapshot for a manual whole-directory copy.

## Tailscale

No router port forwarding is needed. Limit access with your tailnet ACLs. V1 intentionally uses HTTP within the encrypted Tailscale tunnel and has no application login. Tailscale Serve HTTPS is recommended when installable PWA support is added later.

