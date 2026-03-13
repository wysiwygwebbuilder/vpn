#!/usr/bin/env node

/**
 * Скачивание libbox.aar через Node.js HTTPS
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LIBBOX_URL = 'https://raw.githubusercontent.com/xinggaoya/sing-box-windows-android/master/app/libs/libbox.aar';
const OUTPUT_PATH = path.join(__dirname, '..', 'android', 'app', 'libs', 'libbox.aar');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`📦 Downloading libbox.aar...`);
        console.log(`   URL: ${url}`);

        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const file = fs.createWriteStream(dest);
        let downloadedSize = 0;
        let lastProgress = 0;

        https.get(url, { 
            followRedirects: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                console.log(`   Redirect to: ${response.headers.location}`);
                https.get(response.headers.location, { 
                    followRedirects: true,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }, (redirectResponse) => {
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

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const progress = totalSize > 0 ? (downloadedSize / totalSize * 100) : 0;
                
                // Показываем прогресс каждые 10%
                if (progress - lastProgress >= 10) {
                    console.log(`   Progress: ${progress.toFixed(0)}% (${(downloadedSize / 1024 / 1024).toFixed(2)} / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                    lastProgress = progress;
                }
            });

            file.on('finish', () => {
                file.close();
                console.log(`\n✅ Download complete: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB`);
                resolve();
            });
        }
    });
}

async function main() {
    try {
        // Удаляем старый файл
        if (fs.existsSync(OUTPUT_PATH)) {
            const oldStats = fs.statSync(OUTPUT_PATH);
            if (oldStats.size > 0) {
                console.log(`🗑️  Removing old file (${(oldStats.size / 1024 / 1024).toFixed(2)} MB)...`);
            }
            fs.unlinkSync(OUTPUT_PATH);
        }

        await downloadFile(LIBBOX_URL, OUTPUT_PATH);
        
        // Проверка файла
        const stats = fs.statSync(OUTPUT_PATH);
        console.log(`\n📊 File saved: ${OUTPUT_PATH}`);
        console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        if (stats.size < 1024 * 1024) {
            console.log('\n⚠️  Warning: File is too small, may be corrupted or HTML error page');
        } else {
            console.log('\n✅ File looks valid!');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code === 'ENOTFOUND') {
            console.log('   Check your internet connection');
        }
        process.exit(1);
    }
}

main();
