const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const aarPath = 'D:/OSPanel/domains/proxi-mob.loc/android/app/libs/libbox.aar';
const zip = new AdmZip(aarPath);
const entries = zip.getEntries();

console.log('libbox.aar contents:');
entries.forEach(entry => {
    console.log(`  ${entry.entryName} (${entry.header.size} bytes)`);
});
