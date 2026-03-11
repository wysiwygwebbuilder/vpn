const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'index.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
  return String.fromCharCode(parseInt(hex, 16));
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Unicode escape sequences converted to normal text');
