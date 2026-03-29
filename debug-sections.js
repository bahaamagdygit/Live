const AdmZip = require('./node_modules/adm-zip');
const { DOMParser } = require('./node_modules/@xmldom/xmldom');

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node debug-sections.js <file.pptx>'); process.exit(1); }

const zip = new AdmZip(filePath);
const entries = zip.getEntries();

// 1. List all files
console.log('\n=== ALL FILES IN ZIP ===');
entries.forEach(e => console.log(' ', e.entryName));

// 2. Read presentation.xml raw
console.log('\n=== ppt/presentation.xml RAW ===');
const presEntry = zip.getEntry('ppt/presentation.xml');
if (!presEntry) { console.log('NOT FOUND'); process.exit(1); }
const xml = presEntry.getData().toString('utf8');
console.log(xml);

// 3. Lines containing "section"
console.log('\n=== LINES WITH "section" ===');
xml.split('\n').forEach((line, i) => {
  if (line.toLowerCase().includes('section'))
    console.log(`  L${i + 1}: ${line.trim()}`);
});

// 4. Parse XML and search for sectionLst variants
console.log('\n=== sectionLst TAG SEARCH ===');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
['p:sectionLst', 'sectionLst', 'p14:sectionLst'].forEach(tag => {
  const found = doc.getElementsByTagName(tag);
  console.log(`  ${tag}: ${found.length} element(s)`);
});

// 5. Namespace declarations from root
console.log('\n=== NAMESPACES ON ROOT ELEMENT ===');
const root = doc.documentElement;
if (root && root.attributes) {
  for (let i = 0; i < root.attributes.length; i++) {
    const attr = root.attributes[i];
    if (attr.name.startsWith('xmlns')) console.log(' ', attr.name, '=', attr.value);
  }
}

// 6. Search all xml/rels files for "section"
console.log('\n=== ALL XML/RELS FILES CONTAINING "section" ===');
entries
  .filter(e => e.entryName.endsWith('.xml') || e.entryName.endsWith('.rels'))
  .forEach(e => {
    const content = e.getData().toString('utf8');
    const lines = content.split('\n').filter(l => l.toLowerCase().includes('section'));
    if (lines.length > 0) {
      console.log(`\n  FILE: ${e.entryName}`);
      lines.forEach(l => console.log('   ', l.trim()));
    }
  });

console.log('\n=== DONE ===');
