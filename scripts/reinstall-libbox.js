#!/usr/bin/env node

/**
 * Полная переустановка libbox.aar
 * Удаляет старый файл и скачивает свежий из SFA APK
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SFA_VERSION = '1.10.0';
const SFA_URL = `https://github.com/SagerNet/sing-box/releases/download/v${SFA_VERSION}/SFA-${SFA_VERSION}-universal.apk`;
const TEMP_DIR = path.join(__dirname, '..', 'temp-libbox');
const APK_PATH = path.join(TEMP_DIR, 'sing-box.apk');
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

function extractLibbox() {
    return new Promise((resolve, reject) => {
        console.log('\n🔧 Extracting libbox.aar from APK...');

        try {
            const libDir = path.join(TEMP_DIR, 'lib');

            // Пробуем извлечь через unzip
            try {
                execSync(`unzip -o "${APK_PATH}" "lib/*" -d "${TEMP_DIR}"`, {
                    stdio: 'pipe',
                    cwd: TEMP_DIR
                });

                const files = execSync(`dir /s /b ${libDir}\\*.aar`, { encoding: 'utf8' })
                    .trim()
                    .split('\r\n')
                    .filter(f => f.length > 0);

                if (files.length > 0) {
                    fs.copyFileSync(files[0], OUTPUT_FILE);
                    console.log(`✅ libbox.aar extracted: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
                    resolve();
                    return;
                }
            } catch (unzipError) {
                console.log('⚠️  unzip not available, trying alternative method...');
            }

            // Альтернатива: используем Node.js с adm-zip
            console.log('📦 Using JS-based ZIP extraction...');

            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(APK_PATH);
                const entries = zip.getEntries();

                for (const entry of entries) {
                    if (entry.entryName.includes('libbox.aar') || entry.entryName.includes('libbox.so')) {
                        console.log(`   Found: ${entry.entryName}`);

                        if (!fs.existsSync(OUTPUT_DIR)) {
                            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                        }

                        zip.extractEntryTo(entry, OUTPUT_DIR, false, true);

                        const extractedPath = path.join(OUTPUT_DIR, path.basename(entry.entryName));
                        if (extractedPath !== OUTPUT_FILE) {
                            fs.renameSync(extractedPath, OUTPUT_FILE);
                        }

                        console.log(`✅ libbox.aar extracted: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
                        resolve();
                        return;
                    }
                }

                reject(new Error('libbox.aar not found in APK'));
            } catch (admZipError) {
                reject(new Error('adm-zip not available. Install with: npm install adm-zip'));
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

        // Скачиваем APK
        await downloadFile(SFA_URL, APK_PATH);

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
        if (finalStats.size < 1024 * 1024) { // Менее 1MB - подозрительно
            throw new Error('libbox.aar is too small, may be corrupted');
        }

        // Очищаем временную папку
        console.log('\n🧹 Cleaning up...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });

        console.log('\n✅ Installation complete!');
        console.log(`📍 libbox.aar saved to: ${OUTPUT_FILE}`);
        console.log(`📊 File size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Clean build:');
        console.log('      cd android && ./gradlew clean');
        console.log('   2. Build project:');
        console.log('      eas build --platform android --profile preview');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        // Не очищаем temp для отладки
        if (fs.existsSync(TEMP_DIR)) {
            console.log(`\n📁 Temp files preserved in: ${TEMP_DIR}`);
        }
        
        console.log('\n📝 MANUAL INSTALLATION:');
        console.log('   1. Download SFA APK from:');
        console.log(`      ${SFA_URL}`);
        console.log('   2. Open APK with 7-Zip');
        console.log('   3. Extract libbox.aar from lib/ folder');
        console.log('   4. Save to: android/app/libs/libbox.aar');
        process.exit(1);
    }
}

main();
