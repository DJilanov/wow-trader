# Clean Browsertrix browser session

## Purpose

Start an interactive Browsertrix browser with a completely empty profile, so a page can be
inspected without cookies, local storage, extensions or a saved profile from an earlier run.

This is a local diagnostic tool. It is not a crawler transport, it does not drive the reference
worker, and it must not be used to export a manually verified session back into the production
crawler. The production boundary is documented in
[operator-assisted challenge inspection](../operator-assisted-challenge-inspection.md) and
[Wowhead reference enrichment](../wowhead-reference-enrichment.md).

## What "clean" means here

- No `--profile` argument.
- No `/crawls/profiles` volume mount.
- A new container for every reset.
- The browser profile lives only inside the container and is discarded when the container stops.

A clean session answers a narrow question: does this URL render for a fresh browser in this
container, or does it produce an immediate denial/challenge? A successful render is not evidence
that the production crawler may reuse the session or bypass the source's access policy.

## Prerequisites

- Docker is running.
- The Browsertrix crawler image is available locally.
- Ports `9223` and `6080` are free on `127.0.0.1`.

Check the image and its environment:

```sh
docker image inspect webrecorder/browsertrix-crawler:1.15.0 \
  --format '{{range .Config.Env}}{{println .}}{{end}}'
```

Official Browsertrix 1.15.0 reports `BROWSER_NAME=brave-origin`; that value alone does not mean a
custom build. Confirm the image provenance with its repo digest and labels:

```sh
docker image inspect webrecorder/browsertrix-crawler:1.15.0 \
  --format 'repoDigests={{json .RepoDigests}}{{println}}labels={{json .Config.Labels}}'
```

The `1.15.0` image in this environment is the official Webrecorder build, not a locally modified
one. Even so, treat a successful interactive render as a diagnostic data point, not as a
production access result.

Retrieve the VNC password from the same image instead of assuming it:

```sh
docker image inspect webrecorder/browsertrix-crawler:1.15.0 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep VNC_PASS
```

## Start a clean session

```sh
docker run -d --rm --name browsertrix-clean \
  -p 127.0.0.1:9223:9223 \
  -p 127.0.0.1:6080:6080 \
  webrecorder/browsertrix-crawler:1.15.0 \
  create-login-profile \
  --url 'https://www.wowhead.com/forever/quest=581'
```

Open the interactive view:

```sh
open http://127.0.0.1:9223
```

On Linux, use `xdg-open http://127.0.0.1:9223` instead. The VNC password is the value retrieved
above.

Use `about:blank` when the first URL should be entered manually:

```sh
--url 'about:blank'
```

## Reset

Reset by replacing the container. Stopping it is enough because it was started with `--rm`, but
the explicit `docker rm -f` also handles a stuck or previously created container with the same
name:

```sh
docker stop browsertrix-clean 2>/dev/null || true
docker rm -f browsertrix-clean 2>/dev/null || true

docker run -d --rm --name browsertrix-clean \
  -p 127.0.0.1:9223:9223 \
  -p 127.0.0.1:6080:6080 \
  webrecorder/browsertrix-crawler:1.15.0 \
  create-login-profile \
  --url 'https://www.wowhead.com/forever/quest=581'

open http://127.0.0.1:9223
```

`docker restart browsertrix-clean` is not a reset: it keeps the container filesystem and therefore
the browser profile. Use the replacement flow above when a truly empty profile is required.

## Optional shell function

```sh
btrix-clean() {
  docker rm -f browsertrix-clean >/dev/null 2>&1 || true
  docker run -d --rm --name browsertrix-clean \
    -p 127.0.0.1:9223:9223 \
    -p 127.0.0.1:6080:6080 \
    webrecorder/browsertrix-crawler:1.15.0 \
    create-login-profile \
    --url "${1:-https://www.wowhead.com/forever/quest=581}"
  open http://127.0.0.1:9223
}
```

Examples:

```sh
btrix-clean
btrix-clean 'https://www.wowhead.com/forever/item=25'
btrix-clean 'about:blank'
```

## Verify and inspect

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9223/
docker ps --filter name=browsertrix-clean
docker logs --tail 40 browsertrix-clean
```

The UI should return `200`. The log should contain `Browser Profile UI Server started` and
`Loading page:` for the requested URL. `Loaded!` in the log means the page navigation resolved; it
does not mean the page contains the expected content. Confirm the actual render in the VNC view.

## Important limitations

- Do not add a `/crawls/profiles` volume unless a saved profile is explicitly desired. A writable
  mount is what turns a temporary session into a reusable profile.
- Do not click **Create Profile** for a session that is meant to stay clean. With no mount, the
  tarball is written only inside the container and is lost when it stops. The UI message
  `Profile Created! You may now close this window.` confirms the container-side write; it does not
  mean a profile exists on the host.
- Do not pass the resulting profile to `--profile` or `BROWSERTRIX_PROFILE` for the production
  reference crawler. That is the manually verified session reuse excluded by
  [operator-assisted challenge inspection](../operator-assisted-challenge-inspection.md).
- A cookie or profile transfer from a macOS Brave profile will not work as-is in this Linux image:
  macOS Brave encrypts cookie values with a Keychain-held key, while Browsertrix's Chromium uses
  `--password-store=basic`.
- A source-provided challenge token is short-lived and tied to the interactive session's network
  and browser context. A page that renders here does not imply a stable crawler access path.

## Troubleshooting

### Port already allocated

```text
Bind for 127.0.0.1:6080 failed: port is already allocated
```

Find and stop the container using the ports:

```sh
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker stop <container-name>
```

Do not switch `9223` to another host port. The Browsertrix profile UI embeds the VNC endpoint on
the fixed container ports, so the host mappings must remain `9223:9223` and `6080:6080`.

### Container exits immediately

```sh
docker ps -a --filter name=browsertrix-clean
docker logs browsertrix-clean
```

Common causes are an invalid image tag, a missing `--url`, or a Docker daemon problem. Remove the
container and start again after fixing the cause.

### The UI opens but the browser is blank

Wait a few seconds and reload the UI. The log should show the profile UI server, the VNC screencast
and the page load. If VNC asks for a password, use the `VNC_PASS` value from the image.

### The page shows `403` or a challenge

That is a source-access result, not a Browsertrix configuration error. Do not try to repair it by
copying cookies or a personal browser profile. Use the approved access paths in
[Wowhead browser-versus-crawler access issue](../wowhead-browser-access-issue.md).

## Cleanup

```sh
docker stop browsertrix-clean
```

No profile, cookie jar or downloaded page is retained on the host because the session has no
volume mount and uses `--rm`.
