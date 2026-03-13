#!/usr/bin/env node

/**
 * Создание правильного libbox.aar из NekoBox APK
 * AAR должен содержать AndroidManifest.xml, classes.jar и native библиотеки
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');

const NEKOBOX_VERSION = '1.4.2';
const NEKOBOX_URL = `https://github.com/MatsuriDayo/NekoBoxForAndroid/releases/download/${NEKOBOX_VERSION}/NekoBox-1.4.2-arm64-v8a.apk`;
const TEMP_DIR = path.join(__dirname, '..', 'temp-libbox');
const APK_PATH = path.join(TEMP_DIR, 'nekobox.apk');
const AAR_BUILD_DIR = path.join(TEMP_DIR, 'libbox-aar-build');
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

function extractWithAdmZip() {
    return new Promise((resolve, reject) => {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(APK_PATH);
            zip.extractAllTo(TEMP_DIR, true);
            console.log('✅ APK extracted with adm-zip');
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

function createAarFromApk() {
    return new Promise((resolve, reject) => {
        console.log('\n🔧 Creating libbox.aar from APK contents...');

        try {
            // Создаем структуру AAR
            if (!fs.existsSync(AAR_BUILD_DIR)) {
                fs.mkdirSync(AAR_BUILD_DIR, { recursive: true });
            }

            const libsDir = path.join(AAR_BUILD_DIR, 'jni', 'arm64-v8a');
            fs.mkdirSync(libsDir, { recursive: true });

            // 1. Копируем libbox.so из APK в AAR структуру
            const apkLibDir = path.join(TEMP_DIR, 'lib', 'arm64-v8a');
            const possibleLibNames = ['libbox.so', 'libnekobox.so', 'libcore.so', 'libgojni.so'];
            
            let libboxFound = false;
            for (const libName of possibleLibNames) {
                const srcPath = path.join(apkLibDir, libName);
                if (fs.existsSync(srcPath)) {
                    const destPath = path.join(libsDir, 'libbox.so');
                    fs.copyFileSync(srcPath, destPath);
                    console.log(`✅ Copied ${libName} -> libbox.so`);
                    libboxFound = true;
                    break;
                }
            }

            if (!libboxFound) {
                // Ищем любые .so файлы в lib/arm64-v8a
                if (fs.existsSync(apkLibDir)) {
                    const files = fs.readdirSync(apkLibDir);
                    console.log(`📁 Files in lib/arm64-v8a: ${files.join(', ')}`);
                    
                    // Копируем первый .so файл
                    const soFiles = files.filter(f => f.endsWith('.so'));
                    if (soFiles.length > 0) {
                        const srcPath = path.join(apkLibDir, soFiles[0]);
                        const destPath = path.join(libsDir, 'libbox.so');
                        fs.copyFileSync(srcPath, destPath);
                        console.log(`✅ Copied ${soFiles[0]} -> libbox.so`);
                        libboxFound = true;
                    }
                }
            }

            if (!libboxFound) {
                reject(new Error('No suitable .so library found in APK'));
                return;
            }

            // 2. Создаем минимальный AndroidManifest.xml
            const manifestPath = path.join(AAR_BUILD_DIR, 'AndroidManifest.xml');
            const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="io.github.nekohasekai.libbox">
    
    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="34" />
</manifest>
`;
            fs.writeFileSync(manifestPath, manifest);
            console.log('✅ Created AndroidManifest.xml');

            // 3. Создаем пустой classes.jar (если нет в APK)
            const classesJarDir = path.join(AAR_BUILD_DIR, 'libs');
            fs.mkdirSync(classesJarDir, { recursive: true });
            
            const apkClassesJar = path.join(TEMP_DIR, 'classes.jar');
            if (fs.existsSync(apkClassesJar)) {
                fs.copyFileSync(apkClassesJar, path.join(classesJarDir, 'classes.jar'));
                console.log('✅ Copied classes.jar from APK');
            } else {
                // Создаем минимальный JAR с пустым классом
                console.log('⚠️  Creating minimal classes.jar...');
                // Для простоты создаем пустой JAR
                const minimalJarPath = path.join(classesJarDir, 'classes.jar');
                // JAR файл это ZIP с META-INF/MANIFEST.MF
                const AdmZip = require('adm-zip');
                const zip = new AdmZip();
                zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nCreated-By: libbox-installer\n\n'));
                fs.writeFileSync(minimalJarPath, zip.toBuffer());
                console.log('✅ Created minimal classes.jar');
            }

            // 4. Создаем R.txt (пустой)
            const rTxtPath = path.join(AAR_BUILD_DIR, 'R.txt');
            fs.writeFileSync(rTxtPath, '');
            console.log('✅ Created R.txt');

            // 5. Создаем proguard.txt (пустой)
            const proguardPath = path.join(AAR_BUILD_DIR, 'proguard.txt');
            fs.writeFileSync(proguardPath, '');
            console.log('✅ Created proguard.txt');

            // 6. Создаем public.txt (пустой)
            const publicPath = path.join(AAR_BUILD_DIR, 'public.txt');
            fs.writeFileSync(publicPath, '');
            console.log('✅ Created public.txt');

            // 7. Создаем AAR файл (ZIP архив)
            console.log('\n📦 Building libbox.aar...');
            const AdmZip = require('adm-zip');
            const aarZip = new AdmZip();

            // Функция для добавления директории в ZIP с сохранением структуры
            function addDirectoryToZip(zip, dirPath, zipPath) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    const stat = fs.statSync(filePath);
                    const relativeZipPath = zipPath ? path.join(zipPath, file) : file;
                    
                    if (stat.isDirectory()) {
                        addDirectoryToZip(zip, filePath, relativeZipPath);
                    } else {
                        zip.addLocalFile(filePath, path.dirname(relativeZipPath));
                    }
                }
            }

            addDirectoryToZip(aarZip, AAR_BUILD_DIR, '');

            // Сохраняем AAR
            if (!fs.existsSync(OUTPUT_DIR)) {
                fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            }
            
            aarZip.writeZip(OUTPUT_FILE);
            
            const finalStats = fs.statSync(OUTPUT_FILE);
            console.log(`✅ libbox.aar created: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);

            resolve();
        } catch (error) {
            reject(error);
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
        if (fs.existsSync(AAR_BUILD_DIR)) {
            fs.rmSync(AAR_BUILD_DIR, { recursive: true, force: true });
        }

        // Создаем временную папку
        fs.mkdirSync(TEMP_DIR, { recursive: true });

        // Скачиваем NekoBox APK
        await downloadFile(NEKOBOX_URL, APK_PATH);

        // Устанавливаем adm-zip
        try {
            require.resolve('adm-zip');
        } catch (e) {
            console.log('\n📦 Installing adm-zip...');
            execSync('npm install adm-zip --no-save', { stdio: 'inherit' });
        }

        // Извлекаем APK
        await extractWithAdmZip();

        // Создаем AAR
        await createAarFromApk();

        // Проверяем целостность
        if (!fs.existsSync(OUTPUT_FILE)) {
            throw new Error('libbox.aar was not created');
        }

        const finalStats = fs.statSync(OUTPUT_FILE);
        if (finalStats.size < 100 * 1024) {
            throw new Error('libbox.aar is too small, may be corrupted');
        }

        // Очищаем временную папку
        console.log('\n🧹 Cleaning up...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        fs.rmSync(AAR_BUILD_DIR, { recursive: true, force: true });

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
        console.error(error.stack);
        
        // Не очищаем temp для отладки
        console.log(`\n📁 Temp files preserved in: ${TEMP_DIR}`);
        console.log(`📁 AAR build files in: ${AAR_BUILD_DIR}`);
        
        process.exit(1);
    }
}

main();
