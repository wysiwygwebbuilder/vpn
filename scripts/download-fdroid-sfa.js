#!/usr/bin/env node

/**
 * Скачивание F-Droid SFA APK и проверка на наличие libbox.aar
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const F_DROID_URL = 'https://f-droid.org/repo/io.nekohasekai.sfa_631.apk';
const OUTPUT_PATH = path.join(__dirname, '..', 'temp-sfa.apk');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`📦 Downloading from F-Droid...`);
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
        await downloadFile(F_DROID_URL, OUTPUT_PATH);
        
        // Проверка файла
        const stats = fs.statSync(OUTPUT_PATH);
        console.log(`\n📊 File saved: ${OUTPUT_PATH}`);
        console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        // Проверка содержимого
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(OUTPUT_PATH);
        const entries = zip.getEntries();
        
        console.log('\n🔍 Searching for libbox files...\n');
        
        const aarFiles = [];
        const soFiles = [];
        
        entries.forEach(entry => {
            const name = entry.entryName.toLowerCase();
            if (name.endsWith('.aar')) {
                aarFiles.push({ name: entry.entryName, size: entry.header.size });
            }
            if (name.endsWith('.so') && name.includes('libbox')) {
                soFiles.push({ name: entry.entryName, size: entry.header.size });
            }
        });
        
        if (aarFiles.length > 0) {
            console.log('✅ Found AAR files:');
            aarFiles.forEach(f => console.log(`   ${f.name} - ${(f.size / 1024 / 1024).toFixed(2)} MB`));
            
            // Извлекаем первый AAR
            const targetAar = aarFiles.find(f => f.name.toLowerCase().includes('libbox')) || aarFiles[0];
            const entry = entries.find(e => e.entryName === targetAar);
            
            const outputDir = path.join(__dirname, '..', 'android', 'app', 'libs');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            zip.extractEntryTo(entry, outputDir, false, true);
            console.log(`\n✅ Extracted ${targetAar} to android/app/libs/`);
        } else {
            console.log('❌ No AAR files found in F-Droid APK');
            
            if (soFiles.length > 0) {
                console.log('\n📦 Found libbox SO files:');
                soFiles.forEach(f => console.log(`   ${f.name} - ${(f.size / 1024 / 1024).toFixed(2)} MB`));
                console.log('\n⚠️  F-Droid also uses static linking (no separate AAR)');
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
