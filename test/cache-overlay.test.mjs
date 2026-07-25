// test/cache-overlay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayCacheSettings } from '../lib/cache-overlay.mjs';

const corrected = `<?xml version="1.0" encoding="UTF-8"?>
<cache-settings xmlns="x">
    <settings>
        <development><static-cache-ttl>2592000</static-cache-ttl><page-cache-enabled>true</page-cache-enabled></development>
        <staging><static-cache-ttl>0</static-cache-ttl><page-cache-enabled>false</page-cache-enabled></staging>
        <production><static-cache-ttl>2592000</static-cache-ttl><page-cache-enabled>true</page-cache-enabled></production>
    </settings>
</cache-settings>`;

const siteFile = `<?xml version="1.0" encoding="UTF-8"?>
<cache-settings xmlns="x">
    <settings>
        <development><static-cache-ttl>0</static-cache-ttl><page-cache-enabled>false</page-cache-enabled></development>
        <staging><static-cache-ttl>2592000</static-cache-ttl><page-cache-enabled>true</page-cache-enabled></staging>
        <production><static-cache-ttl>2592000</static-cache-ttl><page-cache-enabled>true</page-cache-enabled></production>
    </settings>
    <page-cache-partitions>
        <page-cache-partition partition-id="Homepage"><name>Homepage</name></page-cache-partition>
    </page-cache-partitions>
</cache-settings>`;

test('overlays corrected settings (dev on, staging off)', () => {
  const out = overlayCacheSettings(siteFile, corrected);
  // dev now enabled
  assert.match(out, /<development><static-cache-ttl>2592000<\/static-cache-ttl><page-cache-enabled>true/);
  // staging now disabled
  assert.match(out, /<staging><static-cache-ttl>0<\/static-cache-ttl><page-cache-enabled>false/);
});

test('preserves page-cache-partitions', () => {
  const out = overlayCacheSettings(siteFile, corrected);
  assert.match(out, /partition-id="Homepage"/);
});

// The four tests below probe weaknesses in a naive `str.replace(regex, matchedString)` approach
// Each fails against the brief's literal Step-2 implementation; see task-7-report.md for the
// failure output captured before hardening

test('replacement is not corrupted by "$"-prefixed sequences in the corrected block', () => {
  // String.prototype.replace(regex, STRING) gives "$&", "$1", "$'" and the backtick-prefixed form
  // special meaning in the replacement STRING - "$&" means "insert the substring that matched", so
  // passing the corrected match text directly as a replacement string (rather than through a
  // replacer function) means a literal "$&" inside the corrected text re-inserts the SITE's old
  // (uncorrected) matched text. Built via a replacer FUNCTION (not a replacement string) so the
  // fixture itself contains a literal "$&" without tripping the same substitution while
  // constructing the fixture
  const correctedWithDollar = corrected.replace('</settings>', () => '<note>Cost is $&, terms apply</note></settings>');
  const out = overlayCacheSettings(siteFile, correctedWithDollar);
  assert.match(out, /<note>Cost is \$&, terms apply<\/note>/);
  // must not have re-inserted the site's ORIGINAL (uncorrected) staging block anywhere
  assert.doesNotMatch(out, /<staging><static-cache-ttl>2592000/);
});

test('throws on ambiguous multiple <settings> blocks in the site file (does not silently pick one)', () => {
  const twoBlocks = `<root>
    <settings><development/></settings>
    <settings><staging/></settings>
    <page-cache-partitions><page-cache-partition partition-id="X"/></page-cache-partitions>
  </root>`;
  assert.throws(() => overlayCacheSettings(twoBlocks, corrected), /ambiguous|multiple|expected exactly 1/i);
});

test('throws on ambiguous multiple <settings> blocks in the corrected file', () => {
  const twoBlocks = '<root><settings><development/></settings><settings><staging/></settings></root>';
  assert.throws(() => overlayCacheSettings(siteFile, twoBlocks), /ambiguous|multiple|expected exactly 1/i);
});

test('throws on nested <settings> tags rather than silently truncating at the inner close tag', () => {
  const nestedSite = '<root><settings><settings>inner</settings></settings><page-cache-partitions/></root>';
  assert.throws(() => overlayCacheSettings(nestedSite, corrected), /ambiguous|nested|expected exactly 1/i);
});
