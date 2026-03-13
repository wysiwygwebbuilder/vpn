#!/usr/bin/env node

/**
 * Скачивание SFA (Sing-Box for Android) и извлечение libbox.aar
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SFA_VERSION = '1.10.0';
const SFA_URL = `https://github.com/SagerNet/sing-box/releases/download/v${SFA_VERSION}/SFA-${SFA_VERSION}-universal.apk`;
const TEMP_DIR = path.join(__dirname, '..', 'temp-sfa');
const APK_PATH = path.join(TEMP_DIR, 'sfa.apk');
const OUTPUT_DIR = path.join(__dirname, '..', 'android', 'app', 'libs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'libbox.aar');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`📦 Downloading SFA v${SFA_VERSION}...`);
        console.log(`   URL: ${url}`);

        const file = fs.createWriteStream(dest);
        let downloadedSize = 0;

        https.get(url, { followRedirects: true }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, { followRedirects: true }, (redirectResponse) => {
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

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                process.stdout.write(`\r   Downloaded: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB`);
            });

            file.on('finish', () => {
                file.close();
                console.log(`\n✅ APK downloaded: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB`);
                resolve();
            });
        }
    });
}

async function main() {
    try {
        // Очищаем старое
        if (fs.existsSync(OUTPUT_FILE)) {
            const oldStats = fs.statSync(OUTPUT_FILE);
            console.log(`🗑️  Removing old libbox.aar (${(oldStats.size / 1024 / 1024).toFixed(2)} MB)...`);
            fs.unlinkSync(OUTPUT_FILE);
        }

        if (fs.existsSync(TEMP_DIR)) {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEMP_DIR, { recursive: true });

        // Скачиваем SFA APK
        await downloadFile(SFA_URL, APK_PATH);

        // Устанавливаем adm-zip
        try {
            require.resolve('adm-zip');
        } catch (e) {
            console.log('\n📦 Installing adm-zip...');
            execSync('npm install adm-zip --no-save', { stdio: 'inherit' });
        }

        // Извлекаем и ищем AAR
        console.log('\n🔍 Searching for AAR files in APK...');
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(APK_PATH);
        const entries = zip.getEntries();

        console.log('\n📁 APK contents:');
        const aarFiles = [];
        const soFiles = [];
        
        entries.forEach(entry => {
            const name = entry.entryName.toLowerCase();
            if (name.endsWith('.aar')) {
                aarFiles.push(entry.entryName);
                console.log(`   AAR: ${entry.entryName} (${(entry.header.size / 1024 / 1024).toFixed(2)} MB)`);
            }
            if (name.includes('libbox') && name.endsWith('.so')) {
                soFiles.push(entry.entryName);
                console.log(`   SO:  ${entry.entryName} (${(entry.header.size / 1024 / 1024).toFixed(2)} MB)`);
            }
        });

        if (aarFiles.length > 0) {
            // Нашли AAR - извлекаем первый
            console.log(`\n✅ Found ${aarFiles.length} AAR file(s)`);
            const targetAar = aarFiles.find(f => f.toLowerCase().includes('libbox')) || aarFiles[0];
            
            const entry = entries.find(e => e.entryName === targetAar);
            if (!fs.existsSync(OUTPUT_DIR)) {
                fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            }
            
            zip.extractEntryTo(entry, OUTPUT_DIR, false, true);
            
            const extractedPath = path.join(OUTPUT_DIR, path.basename(targetAar));
            if (extractedPath !== OUTPUT_FILE) {
                fs.renameSync(extractedPath, OUTPUT_FILE);
            }
            
            const finalStats = fs.statSync(OUTPUT_FILE);
            console.log(`✅ libbox.aar extracted: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
        } else if (soFiles.length > 0) {
            console.log('\n⚠️  No AAR found, but found .so files');
            console.log('   SFA may use static linking');
            console.log('   Need to build libbox.aar from source using gomobile');
        } else {
            console.log('\n❌ No libbox files found in APK');
        }

        // Очищаем
        console.log('\n🧹 Cleaning up...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
