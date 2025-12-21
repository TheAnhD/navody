const https = require('https');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'assets', 'fonts');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'NotoSans-Regular.ttf');

// fallback to DejaVu Sans which has good Unicode coverage
const url = process.env.FONT_URL;
if (!url) {
  console.log('No FONT_URL provided.');
  console.log('To install a Unicode TTF automatically, run:');
  console.log('\nFONT_URL="https://example.com/path/to/NotoSans-Regular.ttf" npm run install-font\n');
  console.log('Or download a TTF (NotoSans or DejaVuSans) and place it in assets/fonts/NotoSans-Regular.ttf');
  process.exit(0);
}

function downloadWithRedirects(u, redirects = 0) {
  if (redirects > 5) {
    console.error('Too many redirects');
    process.exit(1);
  }
  console.log('Downloading', u);
  https.get(u, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, u).toString();
      console.log('Redirect ->', loc);
      downloadWithRedirects(loc, redirects + 1);
      return;
    }
    if (res.statusCode !== 200) {
      console.error('Failed to download font, status', res.statusCode);
      process.exit(1);
    }
    const file = fs.createWriteStream(outPath);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Font saved to', outPath);
    });
  }).on('error', (err) => {
    console.error('Download error', err.message);
    process.exit(1);
  });
}

downloadWithRedirects(url);
