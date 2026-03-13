#!/usr/bin/env node

/**
 * Скрипт для скачивания sing-box ядра для Android
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SING_BOX_VERSION = '1.10.0';
const SING_BOX_URL = `https://github.com/SagerNet/sing-box/releases/download/v${SING_BOX_VERSION}/sing-box-${SING_BOX_VERSION}-linux-arm64.tar.gz`;
const OUTPUT_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'sing-box');

function downloadAndExtract(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`📦 Downloading sing-box v${SING_BOX_VERSION}...`);
        console.log(`   URL: ${url}`);
        
        const file = fs.createWriteStream(dest + '.tar.gz');
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    handleResponse(redirectResponse);
                }).on('error', reject);
            } else {
                response.pipe(file);
                handleResponse(response);
            }
        }).on('error', reject);
        
        function handleResponse(response) {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded: ${dest}.tar.gz`);
                console.log('⚠️  Note: You need to extract the binary manually');
                resolve();
            });
        }
    });
}

async function main() {
    try {
        if (fs.existsSync(OUTPUT_FILE)) {
            console.log('✅ sing-box binary already exists');
            return;
        }
        
        await downloadAndExtract(SING_BOX_URL, OUTPUT_FILE);
        
        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Extract sing-box binary from the .tar.gz file');
        console.log('   2. Place the binary in: android/app/src/main/assets/sing-box');
        console.log('   3. Make it executable in your code');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
