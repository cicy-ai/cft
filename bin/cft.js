#!/usr/bin/env node
'use strict';

// cft — one-command Cloudflare quick tunnel for a local port.
//   npx cft 8008                 → tunnels http://localhost:8008
//   npx cft localhost:3000       → tunnels http://localhost:3000
//   npx cft http://127.0.0.1:5173 [-- extra cloudflared args]
// Downloads the cloudflared binary automatically (cached in ~/.cache/cft) when it
// isn't already on PATH. Zero npm dependencies.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

function log(msg) { process.stderr.write(msg + '\n'); }

function printHelp() {
  log(`cft — one-command Cloudflare quick tunnel

Usage:
  npx github:cicy-ai/cft <port>            e.g.  npx github:cicy-ai/cft 8008
  npx github:cicy-ai/cft <host:port>       e.g.  ... localhost:3000
  npx github:cicy-ai/cft <url> [-- args]   extra flags are passed to cloudflared

cloudflared is downloaded automatically if it isn't on PATH (cached in ~/.cache/cft).
Prints a https://<random>.trycloudflare.com URL you can open from anywhere.`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length || args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(args.length ? 0 : 1);
  }
  const target = args[0];
  // Everything after a literal "--" (or any trailing tokens) goes to cloudflared.
  const rest = args.slice(1).filter((a) => a !== '--');
  let url;
  if (/^https?:\/\//.test(target)) url = target;
  else if (/^\d+$/.test(target)) url = `http://localhost:${target}`;
  else url = `http://${target}`;
  return { url, extra: rest };
}

function which(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) return r.stdout.split(/\r?\n/)[0].trim();
  return null;
}

// Map the current platform/arch to the matching cloudflared release asset.
function assetFor() {
  const p = process.platform;
  const a = process.arch;
  const arch = a === 'arm64' ? 'arm64' : a === 'x64' ? 'amd64' : a === 'ia32' ? '386' : a;
  if (p === 'linux') return { file: `cloudflared-linux-${arch}`, archive: false };
  if (p === 'darwin') return { file: `cloudflared-darwin-${arch}.tgz`, archive: true };
  if (p === 'win32') return { file: `cloudflared-windows-${arch}.exe`, archive: false };
  throw new Error(`unsupported platform: ${p}/${a}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const go = (u, redirects) => {
      https.get(u, { headers: { 'User-Agent': 'cft' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 10) return reject(new Error('too many redirects'));
          res.resume();
          return go(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', reject);
    };
    go(url, 0);
  });
}

async function ensureCloudflared() {
  const onPath = which('cloudflared');
  if (onPath) return onPath;

  const { file, archive } = assetFor();
  const cacheDir = path.join(os.homedir(), '.cache', 'cft');
  fs.mkdirSync(cacheDir, { recursive: true });
  const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const binPath = path.join(cacheDir, binName);
  if (fs.existsSync(binPath)) return binPath;

  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
  log(`↓ cloudflared not found on PATH — downloading ${file} …`);
  const tmp = path.join(cacheDir, file);
  await download(url, tmp);

  if (archive) {
    const r = spawnSync('tar', ['-xzf', tmp, '-C', cacheDir], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`failed to extract ${tmp}`);
    fs.unlinkSync(tmp);
  } else {
    fs.renameSync(tmp, binPath);
  }
  if (process.platform !== 'win32') fs.chmodSync(binPath, 0o755);
  return binPath;
}

(async () => {
  const { url, extra } = parseArgs(process.argv);

  let bin;
  try {
    bin = await ensureCloudflared();
  } catch (e) {
    log('✗ ' + e.message);
    log('  You can also install it yourself: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    process.exit(1);
  }

  log(`▶ tunneling ${url}   (Ctrl-C to stop)`);
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', url, ...extra], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let announced = false;
  const scan = (buf) => {
    const s = buf.toString();
    process.stderr.write(s);
    if (!announced) {
      // The assigned quick-tunnel host looks like https://<random-words>.trycloudflare.com.
      // Exclude api.trycloudflare.com (appears in cloudflared's request/error lines).
      const m = s.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        announced = true;
        log('\n  🌐  ' + m[0] + '\n');
      }
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('error', (e) => { log('✗ ' + e.message); process.exit(1); });
  child.on('exit', (code) => process.exit(code || 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
})();
