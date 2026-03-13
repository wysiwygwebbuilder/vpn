const fs = require('fs');
const AdmZip = require('adm-zip');

const apkPath = 'D:/OSPanel/domains/proxi-mob.loc/temp-sfa.apk';

if (!fs.existsSync(apkPath)) {
    console.log('APK file not found!');
    process.exit(1);
}

const stats = fs.statSync(apkPath);
console.log(`APK size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

const zip = new AdmZip(apkPath);
const entries = zip.getEntries();

console.log('\nSearching for AAR and SO files...\n');

const aarFiles = [];
const soFiles = [];
const jarFiles = [];

entries.forEach(entry => {
    const name = entry.entryName.toLowerCase();
    if (name.endsWith('.aar')) {
        aarFiles.push({ name: entry.entryName, size: entry.header.size });
    }
    if (name.endsWith('.so') && name.includes('libbox')) {
        soFiles.push({ name: entry.entryName, size: entry.header.size });
    }
    if (name.endsWith('.jar') && !name.includes('classes')) {
        jarFiles.push({ name: entry.entryName, size: entry.header.size });
    }
});

if (aarFiles.length > 0) {
    console.log('✅ Found AAR files:');
    aarFiles.forEach(f => console.log(`   ${f.name} - ${(f.size / 1024 / 1024).toFixed(2)} MB`));
} else {
    console.log('❌ No AAR files found');
}

if (soFiles.length > 0) {
    console.log('\n📦 Found libbox SO files:');
    soFiles.forEach(f => console.log(`   ${f.name} - ${(f.size / 1024 / 1024).toFixed(2)} MB`));
}

if (jarFiles.length > 0) {
    console.log('\n📦 Found JAR files:');
    jarFiles.forEach(f => console.log(`   ${f.name} - ${(f.size / 1024 / 1024).toFixed(2)} MB`));
}

// Проверка на наличие Java классов libbox
console.log('\n🔍 Searching for libbox Java classes...');
const libboxClasses = entries.filter(e => 
    e.entryName.toLowerCase().includes('libbox') && 
    (e.entryName.endsWith('.class') || e.entryName.endsWith('.dex'))
);

if (libboxClasses.length > 0) {
    console.log('✅ Found libbox Java classes:');
    libboxClasses.slice(0, 10).forEach(e => console.log(`   ${e.entryName}`));
    if (libboxClasses.length > 10) {
        console.log(`   ... and ${libboxClasses.length - 10} more`);
    }
} else {
    console.log('❌ No libbox Java classes found');
}
