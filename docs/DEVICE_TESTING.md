# Testing on a real phone

The browser Geolocation API works only in a "secure context": an `https://` page or
`http://localhost`. A phone opening the development machine over plain HTTP gets the
map but no position. Every method below exists to get HTTPS between a phone and the
dev build.

## Method 1: same Wi-Fi, trusted local certificate (default for daily work)

1. Install `mkcert` on the development machine and run `mkcert -install` to create a
   local certificate authority.
2. Issue a certificate for the machine's hostname and LAN address, for example
   `mkcert devbox.local 192.168.1.20`.
3. Point the Vite dev server at the certificate (`server.https` in `vite.config.ts`)
   and bind it to all interfaces (`--host`).
4. Install the mkcert root certificate on the phone. Android: Settings, Security,
   Install a certificate, CA certificate. iPhone: open the root file in Safari, install
   the profile, then enable full trust under Settings, General, About, Certificate
   Trust Settings.
5. Open `https://192.168.1.20:5173/s/<site-id>/` on the phone. Tapping the locate
   button asks for location access.

The certificates and the mkcert root key are listed in `.gitignore` and are never
committed.

### iPhone

- Safari refuses the page silently until the mkcert root is installed as a profile and
  explicitly trusted under Settings, General, About, Certificate Trust Settings.
- "Location permission denied" with no prompt means iOS has not given the browser
  itself location access: Settings, Privacy & Security, Location Services, then
  "Safari Websites" (or the browser's own entry) set to "While Using the App". A
  site denied once is reset from Safari's page menu, Website Settings, Location.
- Progressive web apps on iPhone install only from Safari (other browsers cannot
  install them), and iOS evicts a web app's stored data after about a week of non-use
  unless the app is on the home screen. Offline behaviour is therefore observable only
  from the home-screen icon, not from a Safari tab.
- Location is available only while the page is in the foreground; there is no
  background tracking, which suits this product, and the privacy page says so.
- Safari's Web Inspector attaches to an iPhone only from a Mac. On Linux, debug with the
  app's hidden debug panel (long press on the attribution) and with Playwright's WebKit
  engine on the development machine, the closest desktop stand-in.

### Android

- Installing the mkcert root: Settings, Security and privacy, More security settings,
  Install from device storage, CA certificate (menu names vary by vendor). Chrome then
  trusts the dev server. Alternatively skip certificates entirely and give Android
  testers the tunnel URL (method 4), which needs no setup on their phone.
- Install the app from Chrome's menu, "Install app" or "Add to Home screen". Samsung
  Internet and Firefox also support installation. Offline behaviour is observable from
  the installed icon.
- Android keeps location flowing while the app is in the foreground and may keep
  updating briefly in the background, so the app stops watching position when the
  page is hidden (`visibilitychange`), and the privacy page says so.
- Remote debugging works from Linux: enable USB debugging on the phone, connect by
  cable, open `chrome://inspect` in Chrome on the development machine, and the phone's
  tab appears with full DevTools, including the Sensors panel for faking positions on
  the phone.
- Android GPS accuracy varies widely by device, so a test report that names the phone
  model lets pin problems be separated from device problems.

### Giving a tester access

Testers never need to install certificates or trust anything from a development
machine. They get either the staging URL (`staging.openwalk.app`) or a tunnel URL,
plus the one-page tester checklist below, and report back: phone model, browser, what
they searched, what the route did, and a screenshot. Location traces from other people
are never requested or accepted (R16).

## Method 2: on site with a phone hotspot

Turn on the phone's hotspot, join the development machine to it, and run method 1
against the machine's address on the hotspot network. Walk with both devices.

## Method 3: install elsewhere, run offline on site

Open the app over HTTPS (method 1 or 4), add it to the home screen, and wait for the
service worker to report that the site data, graph, tiles and overlay are cached. At
the site, open the installed app with the development machine off. This is the
acceptance test for R11. New builds need another online visit to update.

## Method 4: tunnel (works from anywhere, no phone setup)

`cloudflared tunnel --url http://localhost:5173` prints a temporary public HTTPS URL
(a `trycloudflare.com` address, no account needed). Open it on the phone. With
`openwalk.app` on Cloudflare, a named tunnel gives a stable URL such as
`dev.openwalk.app` and is the same mechanism used in production (see Containers and
deployment in `docs/ARCHITECTURE.md`). On an iPhone this is the least friction:
nothing to install on the phone. Traffic passes through Cloudflare; acceptable because
no request ever carries a position (R27).

## Testing without walking

- Chrome DevTools, Sensors panel: override the position of the browser on the
  development machine.
- Playwright: `context.setGeolocation()` and `grantPermissions(['geolocation'])` in
  the end-to-end suite.
- Demo mode: the app's position provider has three implementations: real GPS, a
  fixed position, and replay of a recorded GPX trace at real or accelerated speed.
  Record a trace at the site with any GPS-logger app on the phone, save it as
  `sites/<site-id>/traces/<name>.gpx` (traces are routes: only the recorder's own),
  and open `/s/<site-id>/?replay=<name>&speed=5` elsewhere to test directions,
  re-routing, and arrival detection; add `&loop` to start over at the end. A fixed
  position is `/s/<site-id>/?at=<lon>,<lat>&accuracy=<metres>`. Both work in the
  development server and are ignored by production builds unless the build sets
  `VITE_ENABLE_REPLAY=true`. The example site ships a synthetic trace,
  `demo-walk`, generated along its walkways rather than recorded.

## Tester checklist (copy to testers)

1. Open the link, allow location when asked.
2. Does the blue dot land where you are standing? Roughly how far off?
3. Search for the place you are next to by number, then by name, then by a word like
   "cafeteria". Did each find it?
4. Get directions to a place across the site and walk it. Did the route stay on real
   paths? Did it announce arrival at the right spot?
5. Try each "nearest" button (parking, call box, or whatever the site offers). Correct?
6. Switch layers. Does the site's official map overlay line up with the satellite view?
7. Add to home screen, turn on airplane mode, open from the icon. Does it still work?
8. Send: phone model, browser, what broke, screenshot. Do not send your location
   history.

## What to check on each site visit

Position accuracy near each entrance, snapping onto the right walkway, route
reasonableness (no cutting across buildings or parking lots), arrival radius, the
locations of "nearest" category places, and the overlay alignment against what you
see.
