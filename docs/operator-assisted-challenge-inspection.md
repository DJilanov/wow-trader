# Operator-assisted challenge inspection

## Scope

The production crawler records third-party challenge pages as read-only evidence. It does not relay
mouse or keyboard input, export verification cookies, or reuse a manually verified session. The
interactive design below is for a local mock challenge, a staging host, or infrastructure whose
operator has explicitly authorized interactive automation.

## Implemented inspection flow

Browsertrix captures a 1920×1080 viewport screenshot into its WARC with `--screenshot view`. When
the crawler recognizes a challenge, it writes the following under the staging directory's
`challenge-evidence/` directory:

- a PNG or JPEG viewport screenshot;
- JSON metadata containing the URL, capture time, HTTP status, challenge classification, body size
  and SHA-256;
- a static HTML report that displays the metadata and screenshot.

Raw challenge HTML is not persisted in the report because it can contain short-lived tokens. The
report has a restrictive Content Security Policy and contains no JavaScript.

Open the newest report with the platform's default browser:

```sh
pnpm --filter @wow-trader/reference-data dev challenge-report \
  --staging artifacts/reference/wowhead-staging \
  --open \
  --browser "Brave Browser"
```

Omit `--browser` to use the platform default. On macOS, a reported file can also be opened explicitly
in Brave with:

```sh
open -a "Brave Browser" /absolute/path/to/challenge-evidence/report.html
```

## Input mapping design for an owned or local test target

Input mapping should be a separate operator-input adapter. It must not be coupled to crawling,
parsing, pacing or persistence. The adapter consumes operator events and emits browser-coordinate
events only while an explicitly authorized interactive session is active.

### Coordinate model

The backend sends a frame descriptor with every screenshot:

```ts
interface FrameDescriptor {
  readonly frameId: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly deviceScaleFactor: number;
}
```

The frontend renders the screenshot with `object-fit: contain`. Pointer coordinates must first be
made relative to the actual rendered image rectangle, excluding letterboxing:

```text
normalizedX = (clientX - imageRect.left) / imageRect.width
normalizedY = (clientY - imageRect.top) / imageRect.height
browserX = clamp(normalizedX, 0, 1) * viewportWidth
browserY = clamp(normalizedY, 0, 1) * viewportHeight
```

Each event carries the `frameId`. The backend rejects events for any frame other than the newest
one, preventing clicks from being applied after navigation or layout changes. Browser coordinates
remain CSS pixels; device scale is used only when the capture or browser protocol explicitly uses
physical pixels.

### Semantic fields

For a target under operator control, semantic mapping is preferable to image-only coordinates. A
small script in the owned page can expose an allowlisted field identifier and its current bounding
rectangle. The frontend displays the rectangle, while the backend accepts text only for that exact
field identifier. It must not accept arbitrary selectors or arbitrary JavaScript.

```ts
type OperatorEvent =
  | { readonly type: "pointer"; readonly frameId: string; readonly x: number; readonly y: number }
  | {
      readonly type: "text";
      readonly frameId: string;
      readonly fieldId: string;
      readonly text: string;
    }
  | { readonly type: "submit"; readonly frameId: string; readonly actionId: string };
```

Text should be bounded in length, normalized, and sent as browser input events rather than inserted
with DOM mutation. Submit actions should use an allowlisted button identifier defined by the owned
test page.

### Session state machine

The interaction service should use an explicit state machine:

```text
Idle → Capturing → AwaitingOperator → Submitting → Verified
                                      ↘ Cancelled
                           Submitting → Failed
```

Only `AwaitingOperator` accepts pointer or text events. Navigation changes the `frameId` and returns
the service to `Capturing`. `Verified`, `Failed` and `Cancelled` close the input channel and erase
in-memory text.

### Local transport and security

- Bind the inspector to `127.0.0.1` only.
- Generate a random, single-session capability token and require it on the WebSocket connection.
- Validate the `Origin` header and reject non-local origins.
- Never send browser cookies, storage values, response bodies or authorization headers to the UI.
- Keep an audit log of frame IDs and event types, but never log entered text.
- Apply event-rate limits and a maximum session lifetime.
- Display an immutable hostname and authorization label above the interactive surface.
- Require a fresh operator confirmation before enabling input for a different hostname.

### Verification plan

Use a local deterministic fixture with text, checkbox and submit controls at known rectangles. Test
letterboxed scaling, Retina/device-scale rendering, window resizing, stale-frame rejection, maximum
text length, disallowed field/action identifiers, origin rejection, session expiry and cancellation.
An end-to-end test should verify that operator events affect only the fixture and that no cookie or
storage data is returned to the inspector.
