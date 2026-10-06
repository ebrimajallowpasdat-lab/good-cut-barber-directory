const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicFiles = [
  'Contact.html',
  'add.html',
  'goodcut-logo.svg',
  'index.html',
  'javascript.js',
  'payment.html',
  'payment.js',
  'review.html',
  'review.js',
  'style.css'
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of publicFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
