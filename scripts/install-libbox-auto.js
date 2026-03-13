#!/usr/bin/env node

/**
 * Автоматическая установка libbox.aar для sing-box VPN
 * Скачивает SFA APK и извлекает libbox.aar
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
            // APK это ZIP файл, используем unzip
            const libDir = path.join(TEMP_DIR, 'lib');
            
            // Пробуем извлечь через unzip
            try {
                execSync(`unzip -o "${APK_PATH}" "lib/*" -d "${TEMP_DIR}"`, { 
                    stdio: 'pipe',
                    cwd: TEMP_DIR
                });
                
                // Ищем libbox.aar в извлечённых файлах
                const files = execSync(`dir /s /b ${libDir}\\*.aar`, { encoding: 'utf8' })
                    .trim()
                    .split('\r\n')
                    .filter(f => f.length > 0);
                
                if (files.length > 0) {
                    // Копируем первый найденный AAR
                    fs.copyFileSync(files[0], OUTPUT_FILE);
                    console.log(`✅ libbox.aar extracted: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
                    resolve();
                    return;
                }
            } catch (unzipError) {
                console.log('⚠️  unzip not available, trying alternative method...');
            }
            
            // Альтернатива: используем Node.js для извлечения ZIP
            console.log('📦 Using JS-based ZIP extraction...');
            
            // Для этого нужен adm-zip
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(APK_PATH);
                const entries = zip.getEntries();
                
                // Ищем libbox.aar в APK
                for (const entry of entries) {
                    if (entry.entryName.includes('libbox.aar') || entry.entryName.includes('libbox.so')) {
                        console.log(`   Found: ${entry.entryName}`);
                        
                        if (!fs.existsSync(OUTPUT_DIR)) {
                            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
                        }
                        
                        // Извлекаем файл
                        zip.extractEntryTo(entry, OUTPUT_DIR, false, true);
                        
                        // Переименовываем если нужно
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
        // Проверяем если файл уже есть
        if (fs.existsSync(OUTPUT_FILE)) {
            const stats = fs.statSync(OUTPUT_FILE);
            if (stats.size > 0) {
                console.log(`✅ libbox.aar already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                return;
            }
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
        
        // Очищаем временную папку
        console.log('\n🧹 Cleaning up...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        
        console.log('\n✅ Installation complete!');
        console.log(`📍 libbox.aar saved to: ${OUTPUT_FILE}`);
        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Update android/app/build.gradle:');
        console.log('      implementation files(\'libs/libbox.aar\')');
        console.log('   2. Commit to git:');
        console.log('      git add android/app/libs/libbox.aar');
        console.log('      git commit -m "Add libbox.aar for sing-box VPN"');
        console.log('      git push');
        console.log('   3. Build:');
        console.log('      eas build --platform android --profile preview');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.log('\n📝 MANUAL INSTALLATION:');
        console.log('   1. Download SFA APK from:');
        console.log(`      ${SFA_URL}`);
        console.log('   2. Open APK with 7-Zip or unzip');
        console.log('   3. Extract libbox.aar from lib/ folder');
        console.log('   4. Save to: android/app/libs/libbox.aar');
        console.log('   5. Update build.gradle');
        console.log('   6. Commit and build');
        process.exit(1);
    }
}

main();
