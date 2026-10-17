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
