const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function calculator(overrides = {}, mode = 'target') {
    const elements = {};
    function element(id = '') {
        if (id && elements[id]) return elements[id];
        const attributes = {};
        const classes = new Set();
        const el = {value: '', innerText: '', textContent: '', innerHTML: '', style: {}, children: [],
            classList: {add: x => classes.add(x), remove: x => classes.delete(x),
                toggle(x, force) {if (force) classes.add(x); else classes.delete(x);}},
            setAttribute: (key, value) => attributes[key] = value,
            removeAttribute: key => delete attributes[key], getAttribute: key => attributes[key],
            appendChild(child) {this.children.push(child);}};
        if (id) elements[id] = el;
        return el;
    }
    // Read defaults from the actual HTML, so changing a UI default cannot leave a stale fixture.
    for (const match of html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g)) element(match[1]).value = match[2];
    for (const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
        const options = [...match[2].matchAll(/<option\b([^>]*)value="([^"]*)"([^>]*)>/g)];
        const chosen = options.find(o => /\bselected\b/.test(o[1] + o[3])) || options[0];
        element(match[1]).value = chosen[2];
    }
    Object.entries(overrides).forEach(([id, value]) => element(id).value = String(value));
    const context = {document: {getElementById: element, createElement: () => element(),
        querySelectorAll: () => Object.values(elements)}, window: {}, setTimeout() {}};
    vm.createContext(context);
    vm.runInContext(script, context);
    vm.runInContext(`currentInputMode = '${mode}'`, context);
    return {el: element, run: () => vm.runInContext('calculate()', context, {timeout: 1000}),
        cable: (...args) => vm.runInContext(`selectCable(${args.join(',')})`, context),
        drop: (...args) => vm.runInContext(`cableDropPercent(${args.join(',')})`, context),
        selectMCB: (current, phase) => vm.runInContext(`selectMCBRating(${current}, ${phase})`, context),
        call: name => vm.runInContext(`${name}()`, context, {timeout: 1000})};
}

test('default P2 dimensions, resolution, power and ports', () => {
    const c = calculator(); assert.equal(c.run(), true);
    assert.equal(c.el('resDimMeter').innerText, '3.20 x 1.92 m');
    assert.equal(c.el('resTotalModules').innerText, '120 Modul');
    assert.equal(c.el('resPixels').innerText, '1.600 × 960 px');
    assert.equal(c.el('resPowerMax').innerText, '3.686 W (3.69 kW)');
    assert.equal(c.el('resControllerPorts').innerText, '3 Port LAN Controller');
});
test('P1.53 proposal example: 180 modules and 3,893,760 pixels', () => {
    const c = calculator({presetSelect: 'p153', targetWidth: 4.8, targetHeight: 1.92}); c.run();
    assert.equal(c.el('resTotalModules').innerText, '180 Modul');
    assert.equal(c.el('resPixels').innerText, '3.120 × 1.248 px');
    assert.equal(3120 * 1248, 3893760);
});
for (const [mode, dimension] of [['nearest', '3.20 x 2.08 m'], ['ceil', '3.52 x 2.08 m'], ['floor', '3.20 x 1.92 m']]) {
    test(`rounding ${mode}: target 3.30 x 2.00 m`, () => {
        const c = calculator({targetWidth: 3.3, targetHeight: 2, roundingMode: mode});
        assert.equal(c.run(), true); assert.equal(c.el('resDimMeter').innerText, dimension);
        assert.match(c.el('sizeDifference').innerText, /Lebar (kurang|lebih)/);
    });
}
test('centimeters and meters produce the same result', () => {
    const c = calculator({targetWidth: 330, targetHeight: 200, unitWidth: 'cm', unitHeight: 'cm', roundingMode: 'ceil'});
    c.run(); assert.equal(c.el('resDimMeter').innerText, '3.52 x 2.08 m');
});
for (const roundingMode of ['ceil', 'floor']) {
    test(`exact multiples are stable despite floating point: ${roundingMode}`, () => {
        const c = calculator({presetSelect: 'custom', customModW: 10, customModH: 10,
            targetWidth: 2.01, unitWidth: 'm', targetHeight: 2.01, roundingMode});
        c.run(); assert.equal(c.el('resGridFormat').innerText, '201 Kolom × 201 Baris');
    });
}
test('floor rejects space too small for one module', () => {
    const c = calculator({targetWidth: 0.1, roundingMode: 'floor'});
    assert.equal(c.run(), false); assert.match(c.el('validationErrors').textContent, /Ruang tidak cukup/);
});
for (const [id, value, extra, mode] of [
    ['targetWidth', '', {}, 'target'], ['targetHeight', '0', {}, 'target'],
    ['targetWidth', '-1', {}, 'target'], ['targetWidth', 'Infinity', {}, 'target'],
    ['targetWidth', '3abc', {}, 'target'], ['customModW', '-320', {presetSelect: 'custom'}, 'target'],
    ['customMaxPower', '0', {presetSelect: 'custom'}, 'target'],
    ['customModW', '', {presetSelect: 'custom'}, 'target'],
    ['customPxH', '0', {presetSelect: 'custom'}, 'target'],
    ['customPitch', '1e308', {presetSelect: 'custom'}, 'target'],
    ['customPxW', '160.5', {presetSelect: 'custom'}, 'target'],
    ['powerFactor', '-0.9', {}, 'target'], ['powerFactor', '0', {}, 'target'],
    ['powerFactor', '2', {}, 'target'], ['powerFactor', '0.4', {}, 'target'],
    ['gridCols', '10.9', {}, 'grid'], ['gridRows', '-1', {}, 'grid'],
    ['gridCols', '10001', {}, 'grid'], ['targetWidth', '1e300', {}, 'target'],
    ['customPxW', '9007199254740991', {presetSelect: 'custom'}, 'target'],
    ['customMaxPower', '1e308', {presetSelect: 'custom'}, 'target'],
    ['roundingMode', 'invalid', {}, 'target'], ['phaseType', '2', {}, 'target']
]) {
    test(`reject ${id}=${JSON.stringify(value)} (${mode})`, () => {
        const c = calculator({...extra, [id]: value}, mode);
        assert.equal(c.run(), false);
        assert.equal(c.el('resPixels').innerText, '—');
        assert.equal(c.el('pdfButton').disabled, true);
        assert.equal(c.el('copyButton').disabled, true);
        assert.ok(c.el('validationErrors').textContent);
        // Invalid results cannot reach clipboard/PDF libraries.
        assert.doesNotThrow(() => c.call('exportToPDF'));
        assert.doesNotThrow(() => c.call('copySummaryText'));
    });
}
test('invalid input clears previous results and recovery enables export', () => {
    const c = calculator(); c.run(); c.el('targetWidth').value = ''; c.run();
    assert.equal(c.el('resDimMeter').innerText, '—');
    assert.equal(c.el('targetWidth').getAttribute('aria-invalid'), 'true');
    c.el('targetWidth').value = '3.2'; assert.equal(c.run(), true);
    assert.equal(c.el('pdfButton').disabled, false);
    assert.equal(c.el('validationErrors').hidden, true);
});
test('inactive fields do not block valid calculations', () => {
    const c = calculator({customModW: '', targetWidth: '', gridCols: 10, gridRows: 12}, 'grid');
    assert.equal(c.run(), true);
});
test('balanced 3-phase current uses the existing voltage and PF assumptions', () => {
    const c = calculator({phaseType: 3}); c.run();
    assert.equal(c.el('resAmpere').innerText, '6.2 Ampere (@ 380V 3-Phase)');
});
test('large grid preview stays bounded', () => {
    const c = calculator({gridCols: 100, gridRows: 100}, 'grid');
    c.run(); assert.equal(c.el('gridPreview').children.length, 1);
    const svg = decodeURIComponent(c.el('gridPreview').children[0].src.split(',')[1]);
    assert.match(svg, /viewBox="0 0 32000 16000"/);
});

for (const pf of [0.5, 1]) {
    test(`power factor boundary ${pf} is accepted`, () => {
        assert.equal(calculator({powerFactor: pf}).run(), true);
    });
}
test('nearest and ceil allow at least one module and disclose oversize', () => {
    for (const roundingMode of ['nearest', 'ceil']) {
        const c = calculator({targetWidth: 0.1, targetHeight: 0.1, roundingMode});
        assert.equal(c.run(), true);
        assert.equal(c.el('resTotalModules').innerText, '1 Modul');
        assert.match(c.el('sizeDifference').innerText, /Lebar lebih 220 mm; tinggi lebih 60 mm/);
    }
});
test('total unit limit applies even when each axis is within its limit', () => {
    const c = calculator({gridCols: 1001, gridRows: 1000}, 'grid');
    assert.equal(c.run(), false); assert.match(c.el('validationErrors').textContent, /Batas kalkulator/);
});

test('rectangular modules retain a 2:1 cell ratio in the static grid', () => {
    const c = calculator(); c.run();
    const image = c.el('gridPreview').children[0];
    assert.equal(image.getAttribute('data-module-ratio'), '2');
    const svg = decodeURIComponent(image.src.split(',')[1]);
    assert.match(svg, /pattern id="module-grid" width="320" height="160"/);
    assert.match(svg, /viewBox="0 0 3200 1920"/);
});
test('square cabinets retain square cells', () => {
    const c = calculator({presetSelect: 'p391_cab'}); c.run();
    assert.equal(c.el('gridPreview').children[0].getAttribute('data-module-ratio'), '1');
});

test('default selects a retail 25 A 1P MCB rather than 24 A', () => {
    const c = calculator(); c.run();
    assert.equal(c.el('resMCB').innerText, 'MCB 1P 25 A');
});
test('P1.53 example selects 40 A instead of non-retail 35 A', () => {
    const c = calculator({presetSelect: 'p153', targetWidth: 4.8, targetHeight: 1.92}); c.run();
    assert.equal(c.el('resMCB').innerText, 'MCB 1P 40 A');
});
test('three phase selection uses current per phase and a linked 3P rating', () => {
    const c = calculator({phaseType: 3}); c.run();
    assert.equal(c.el('resMCB').innerText, 'MCB 3P 10 A');
    assert.match(c.el('resMCBDetail').innerText, /beban seimbang/);
});
test('retail selection preserves exact thresholds and rounds upward between ratings', () => {
    const c = calculator();
    for (const phase of [1, 3]) {
        const ratings = phase === 1 ? [2,4,6,10,16,20,25,32,40,50,63] : [6,10,16,20,25,32,40,50,63];
        assert.equal(c.selectMCB(0.1, phase), ratings[0]);
        ratings.forEach((rating, i) => {
            assert.equal(c.selectMCB(rating, phase), rating);
            assert.equal(c.selectMCB(rating + 0.01, phase), ratings[i + 1] ?? null);
        });
    }
});
test('above curated 63 A range requires evaluation instead of clamping to 63 A', () => {
    const c = calculator({gridCols: 20, gridRows: 20}, 'grid'); c.run();
    assert.match(c.el('resMCB').innerText, /Evaluasi MCCB/);
    assert.match(c.el('resMCBDetail').innerText, /Melebihi daftar/);
    assert.equal(c.selectMCB(80, 1), null);
    assert.equal(c.selectMCB(80, 3), null);
});

test('default cable size coordinates 25 A protection with corrected B2 ampacity', () => {
    const c = calculator(); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 3 × 6 mm²');
    assert.equal(c.el('resBranchCable').innerText, '1 jalur @ NYY Cu 3 × 6 mm²');
    assert.match(c.el('resFeederDetail').innerText, /29,58 A/);
    assert.match(c.el('resCableStatus').innerText, /≤ target 3%/);
});
test('split outgoing circuits size each branch, not the complete screen load', () => {
    const c = calculator({circuitsPerPhase: 3}); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 3 × 6 mm²');
    assert.equal(c.el('resBranchCable').innerText, '3 jalur @ NYY Cu 3 × 2,5 mm²');
    assert.match(c.el('resBranchDetail').innerText, /MCB 1P 10 A/);
});
test('three phase uses five-core feeder and separate three-core outgoing circuits', () => {
    const c = calculator({phaseType: 3, circuitsPerPhase: 2}); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 5 × 2,5 mm²');
    assert.equal(c.el('resBranchCable').innerText, '6 jalur @ NYY Cu 3 × 2,5 mm²');
    assert.match(c.el('resFeederDetail').innerText, /R\/S\/T\/N\/PE/);
});
test('cable cannot be sized only to the load when the upstream breaker is larger', () => {
    const c = calculator({sourceProtection: 63}); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 3 × 25 mm²');
    const bad = calculator({sourceProtection: 10}); bad.run();
    assert.equal(bad.el('resFeederCable').innerText, 'Belum dapat direkomendasikan');
    assert.match(bad.el('resFeederDetail').innerText, /lebih kecil/);
});
test('long feeder upsizes cable for voltage drop', () => {
    const c = calculator({feederLength: 100}); c.run();
    // 25 mm² gives 1.503% > feeder budget 1.5%; 35 mm² is required.
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 3 × 35 mm²');
});
test('hotter and grouped cables need greater sections for the same breaker', () => {
    const c = calculator({cableTemperature: 50, feederFactor: 0.7}); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'NYY Cu 3 × 16 mm²');
});
test('outside cable table does not clamp to an inadequate cable', () => {
    const c = calculator({sourceProtection: 250}); c.run();
    assert.equal(c.el('resFeederCable').innerText, 'Belum dapat direkomendasikan');
    assert.match(c.el('resCableStatus').innerText, /Perlu evaluasi/);
});
test('hand calculation: 1-phase 20 A, 10 m, 10 mm², PF 1 gives 0.430909% drop', () => {
    const c = calculator(); assert.ok(Math.abs(c.drop(20,10,10,1,1) - 0.4309090909) < 1e-9);
});
test('selection requires corrected ampacity to cover breaker and obeys drop budget', () => {
    const c = calculator();
    const cable = c.cable(18,25,20,1,0.9,0.87,1.5);
    assert.equal(cable.section, 6);
    assert.ok(cable.capacity >= 25 && cable.drop <= 1.5);
    assert.equal(c.cable(30,25,20,1,0.9,0.87,1.5), null);
});
for (const [id,value] of [['feederLength',''],['branchLength',-1],['circuitsPerPhase',1.5],
    ['dropLimit',0],['feederFactor',1.1],['branchFactor',0],['cableTemperature',60],['sourceProtection',123]]) {
    test(`reject invalid cable input ${id}`, () => {
        const c = calculator({[id]:value}); assert.equal(c.run(), false);
        assert.equal(c.el('resFeederCable').innerText, '—');
        assert.equal(c.el('resBranchCable').innerText, '—');
    });
}
