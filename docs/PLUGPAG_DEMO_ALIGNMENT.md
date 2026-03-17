# PlugPag Demo Alignment

This kiosk now follows the same behavioral baseline as the official PagBank 4.x demo:

1. Connect Bluetooth first.
2. Check `isAuthenticated()`.
3. If unauthenticated, stop the payment flow.
4. Ask the operator to run interactive PagBank authentication explicitly.
5. Only start the card payment after authentication succeeds.

## Current kiosk behavior

- Auto-connect on boot only prepares the Bluetooth link.
- Boot must not open the PagBank/UOL login flow automatically.
- Interactive auth now logs `startResult`, callback duration, lock-task restoration and the final `isAuthenticated()` check.
- The configured terminal identifier is treated as a generic PlugPag identifier.
- `PRO-*` is preferred for Moderninha PRO / PRO 2 / WIFI.
- Legacy MAC values are still accepted, but only as compatibility input.
- The runtime may resolve the paired terminal by bonded name/address for diagnosis, but it does not overwrite the admin configuration automatically.
- `activationCode` is kept only as a manual legacy fallback via `forceActivate()`.

## Auth diagnostics

- `AUTH_START_FAILED`: the SDK refused to open the interactive auth flow.
- `AUTH_TIMEOUT`: no callback returned before the kiosk timeout window expired.
- `AUTH_FAILED`: operator cancelation or auth failure without persisted token.
- `AUTH_CALLBACK_ERROR_BUT_PERSISTED`: the callback reported error, but the local token persisted and the kiosk can continue.

## Acceptance checklist

- Admin accepts `plugpagDeviceId = PRO-1733203195` without rewriting it to MAC.
- Boot connects the terminal without opening login.
- A connected but unauthenticated terminal is visible in the checkout UI.
- The checkout exposes an explicit `Autenticar PagBank` action.
- Payment is blocked while the terminal is only connected.
- After successful authentication, `isAuthenticated()` stays `true` and payment is allowed.

## Required external validation

Run the official PagBank demo on the same:

- tablet
- PagBank account
- terminal (`PRO-1733203195`, serial `1733203195`)

Decision gate:

- If the official demo authenticates successfully, any remaining problem is still in our app flow.
- If the official demo repeats the same login / password-change / token-persistence failure, the main blocker is PagBank SDK or account state.

## PagBank support packet

Use this exact evidence set when escalating:

- Terminal model: Moderninha PRO 2
- Terminal serial: `1733203195`
- Terminal identifier used by Android/PlugPag: `PRO-1733203195`
- Android version: 15
- App `targetSdkVersion`: 36
- PlugPag SDK: `4.12.0-beta`
- Symptom: login opens, credentials are accepted, flow falls into password-change or does not persist local profile/token

## 16 KB page-size track

Treat this as a separate compatibility track, not as the primary explanation for the current login issue.

Checks:

1. Confirm the device page size, for example with `adb shell getconf PAGE_SIZE`.
2. Confirm with PagBank whether the current PlugPag native libraries are 16 KB aligned.
3. If not, track that as a Play/Android 15+ compatibility blocker outside the authentication investigation.
