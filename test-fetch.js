import https from 'https';

const url = 'https://www.procyclingstats.com/rider/tadej-pogacar/calendar/calendar';

console.log('Testing direct fetch to PCS...');

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  }
};

https.get(url, options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log(`\nBody length: ${body.length}`);
    console.log(`First 500 chars:\n${body.substring(0, 500)}`);

    if (body.includes('<table')) {
      console.log('\n✓ Found table tags');
    }
    if (body.includes('calendar')) {
      console.log('✓ Found "calendar" text');
    }
    if (body.includes('cloudflare') || body.includes('challenge')) {
      console.log('✗ Cloudflare challenge detected');
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
