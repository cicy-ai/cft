# cft

One-command Cloudflare **quick tunnel** for a local port. No account, no config.

```bash
npx github:cicy-ai/cft 8008                 # → tunnels http://localhost:8008
npx github:cicy-ai/cft localhost:3000       # host:port form
npx github:cicy-ai/cft http://127.0.0.1:5173 -- --loglevel debug   # extra flags → cloudflared
```

> The bare name `cft` on npm belongs to an unrelated package, so use the
> `github:cicy-ai/cft` form (or `npm i -g github:cicy-ai/cft` to get a local `cft`
> command).

It prints a public `https://<random>.trycloudflare.com` URL you can open from anywhere.

## How it works

- If `cloudflared` isn't on your `PATH`, `cft` downloads the right binary for your
  OS/arch from Cloudflare's GitHub releases and caches it in `~/.cache/cft`.
- Then it runs `cloudflared tunnel --url http://localhost:<port>` and highlights the
  assigned tunnel URL.
- Zero npm dependencies.

## Use case: Google Cloud Shell

Cloud Shell's own Web Preview proxy 302-redirects background XHR/fetch requests to
Google's JWT auth endpoint, which has no CORS headers — so apps that verify auth via
XHR fail with a CORS error. A direct Cloudflare tunnel bypasses that proxy entirely:

```bash
npx github:cicy-ai/cft 8008
# open the printed https://xxx.trycloudflare.com URL (append ?token=... if your app needs it)
```

## Notes

- Quick tunnels are ephemeral and get a random hostname each run (no custom subdomain).
- Requires outbound access to `*.trycloudflare.com` / `api.trycloudflare.com`. Networks
  that block Cloudflare will fail at "Requesting new quick Tunnel".

## License

MIT
