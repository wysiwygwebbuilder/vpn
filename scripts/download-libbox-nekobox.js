#!/usr/bin/env node

/**
 * Скачивание libbox.aar из NekoBox для Android
 * NekoBox использует модифицированную версию sing-box с готовым AAR
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NEKOBOX_VERSION = '1.4.2';
const NEKOBOX_URL = `https://github.com/MatsuriDayo/NekoBoxForAndroid/releases/download/${NEKOBOX_VERSION}/NekoBox-1.4.2-arm64-v8a.apk`;
const TEMP_DIR = path.join(__dirname, '..', 'temp-libbox');
const APK_PATH = path.join(TEMP_DIR, 'nekobox.apk');
const OUTPUT_DIR = path.join(__dirname, '..', 'android', 'app', 'libs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'libbox.aar');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`📦 Downloading NekoBox v${NEKOBOX_VERSION}...`);
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

function extractLibbox() {
    return new Promise((resolve, reject) => {
        console.log('\n🔧 Extracting libbox.aar from NekoBox APK...');

        try {
            console.log('📦 Using JS-based ZIP extraction with adm-zip...');

            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(APK_PATH);
                const entries = zip.getEntries();

                // Ищем libbox.aar в APK
                for (const entry of entries) {
                    const entryName = entry.entryName.toLowerCase();
                    if (entryName.includes('libbox.aar') || entryName.includes('libcore.aar')) {
                        console.log(`   Found: ${entry.entryName}`);

                        if (!fs.existsSync(OUTPUT_DIR)) {
                            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                        }

                        zip.extractEntryTo(entry, OUTPUT_DIR, false, true);

                        const extractedPath = path.join(OUTPUT_DIR, path.basename(entry.entryName));
                        if (extractedPath !== OUTPUT_FILE) {
                            fs.renameSync(extractedPath, OUTPUT_FILE);
                        }

                        const stats = fs.statSync(OUTPUT_FILE);
                        console.log(`✅ libbox.aar extracted: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        
                        // Проверяем что это ZIP архив (AAR должен быть ZIP)
                        const buffer = fs.readFileSync(OUTPUT_FILE, { encoding: null, length: 4 });
                        if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                            console.log('✅ File format verified (ZIP/AAR)');
                        } else {
                            console.warn('⚠️  Warning: File may not be a valid AAR');
                        }
                        
                        resolve();
                        return;
                    }
                }

                reject(new Error('libbox.aar/libcore.aar not found in NekoBox APK'));
            } catch (admZipError) {
                reject(new Error('adm-zip error: ' + admZipError.message));
            }

        } catch (error) {
            reject(error);
        }
    });
}

async function main() {
    try {
        // Удаляем старый файл если есть
        if (fs.existsSync(OUTPUT_FILE)) {
            const oldStats = fs.statSync(OUTPUT_FILE);
            console.log(`🗑️  Removing old libbox.aar (${(oldStats.size / 1024 / 1024).toFixed(2)} MB)...`);
            fs.unlinkSync(OUTPUT_FILE);
        }

        // Создаем временную папку
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        // Скачиваем NekoBox APK
        await downloadFile(NEKOBOX_URL, APK_PATH);

        // Устанавливаем adm-zip если нет
        try {
            require.resolve('adm-zip');
        } catch (e) {
            console.log('\n📦 Installing adm-zip...');
            execSync('npm install adm-zip --no-save', { stdio: 'inherit' });
        }

        // Извлекаем libbox.aar
        await extractLibbox();

        // Проверяем целостность
        if (!fs.existsSync(OUTPUT_FILE)) {
            throw new Error('libbox.aar was not created');
        }

        const finalStats = fs.statSync(OUTPUT_FILE);
        if (finalStats.size < 1024 * 1024) {
            throw new Error('libbox.aar is too small, may be corrupted');
        }

        // Очищаем временную папку
        console.log('\n🧹 Cleaning up...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });

        console.log('\n✅ Installation complete!');
        console.log(`📍 libbox.aar saved to: ${OUTPUT_FILE}`);
        console.log(`📊 File size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Clean Gradle cache:');
        console.log('      cd android && gradlew clean');
        console.log('   2. Rebuild:');
        console.log('      eas build --platform android --profile preview');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (fs.existsSync(TEMP_DIR)) {
            console.log(`\n📁 Temp files preserved in: ${TEMP_DIR}`);
        }
        
        console.log('\n📝 MANUAL INSTALLATION:');
        console.log('   1. Download NekoBox APK from:');
        console.log(`      https://github.com/MatsuriDayo/NekoBoxForAndroid/releases`);
        console.log('   2. Open APK with 7-Zip');
        console.log('   3. Find and extract libbox.aar or libcore.aar');
        console.log('   4. Save to: android/app/libs/libbox.aar');
        process.exit(1);
    }
}

main();
