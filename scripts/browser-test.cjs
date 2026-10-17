const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const {execFileSync} = require('node:child_process');

(async () => {
    const root = path.resolve(__dirname, '..');
    const output = path.join(root, 'browser-test-results');
    fs.mkdirSync(output, {recursive: true});
    const server = http.createServer((req, res) => {
        if (req.url !== '/') {res.writeHead(404); return res.end();}
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(path.join(root, 'index.html')));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    const results = [];
    try {
        browser = await chromium.launch({headless: true});
        for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
            const page = await browser.newPage({viewport, acceptDownloads: true});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'networkidle', timeout: 60000});
                assert.equal(await page.locator('#resDimMeter').innerText(), '3.20 x 1.92 m');
                assert.equal(await page.locator('#resMCB').innerText(), 'MCB 1P 25 A');
                assert.equal(await page.locator('#resFeederCable').innerText(), 'NYY Cu 3 × 6 mm²');
                await page.locator('#circuitsPerPhase').fill('3');
                assert.equal(await page.locator('#resBranchCable').innerText(), '3 jalur @ NYY Cu 3 × 2,5 mm²');
                await page.locator('#circuitsPerPhase').fill('1');
                await page.locator('#feederLength').fill('');
                assert.equal(await page.locator('#pdfButton').isDisabled(), true);
                await page.locator('#feederLength').fill('20');
                await page.locator('#gridPreview img').evaluate(image => image.decode());
                assert.equal(await page.locator('#gridPreview img').getAttribute('data-module-ratio'), '2');
                const gridBox = await page.locator('#gridPreview img').boundingBox();
                assert.ok(Math.abs(gridBox.width / gridBox.height - 3.2 / 1.92) < 0.01, 'Grid keeps physical aspect ratio');
                assert.equal(await page.evaluate(() => typeof html2pdf), 'function', 'PDF dependency must load');
                assert.equal(await page.locator('header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(12, 42, 77)', 'Tailwind styles must load');
                await page.locator('#targetWidth').fill('3.3');
                await page.locator('#targetHeight').fill('2');
                await page.selectOption('#roundingMode', 'ceil');
                assert.equal(await page.locator('#resDimMeter').innerText(), '3.52 x 2.08 m');
                await page.selectOption('#roundingMode', 'floor');
                assert.equal(await page.locator('#resDimMeter').innerText(), '3.20 x 1.92 m');
                await page.locator('#targetWidth').fill('');
                assert.equal(await page.locator('#pdfButton').isDisabled(), true);
                assert.equal(await page.locator('#validationErrors').isVisible(), true);
                assert.equal(await page.locator('#resDimMeter').innerText(), '—');
                await page.locator('#targetWidth').fill('3.2');
                assert.equal(await page.locator('#pdfButton').isDisabled(), false);
                await page.selectOption('#presetSelect', 'custom');
                await page.locator('#customModW').fill('-320');
                assert.equal(await page.locator('#customModW').getAttribute('aria-invalid'), 'true');
                await page.selectOption('#presetSelect', 'p153');
                await page.locator('#targetWidth').fill('4.8');
                await page.locator('#targetHeight').fill('1.92');
                assert.equal(await page.locator('#resTotalModules').innerText(), '180 Modul');
                assert.equal(await page.locator('#resPixels').innerText(), '3.120 × 1.248 px');
                assert.equal(await page.locator('#resMCB').innerText(), 'MCB 1P 40 A');
                await page.selectOption('#phaseType', '3');
                assert.equal(await page.locator('#resMCB').innerText(), 'MCB 3P 16 A');
                await page.selectOption('#phaseType', '1');
                await page.locator('#tabGrid').click();
                await page.locator('#gridCols').fill('10.5');
                assert.equal(await page.locator('#pdfButton').isDisabled(), true);
                await page.locator('#gridCols').fill('15');
                assert.equal(await page.locator('#pdfButton').isDisabled(), false);
                await page.locator('#tabTarget').click();
                if (viewport.width > 600) {
                    await page.evaluate(() => {
                        window.copiedText = '';
                        document.execCommand = command => {
                            if (command === 'copy') window.copiedText = document.querySelector('textarea').value;
                            return true;
                        };
                    });
                    await page.locator('#copyButton').click();
                    assert.match(await page.evaluate(() => window.copiedText), /3\.120 × 1\.248 px/);
                    assert.match(await page.evaluate(() => window.copiedText), /Penyesuaian Ukuran/);
                }
                const downloadPromise = page.waitForEvent('download', {timeout: 60000});
                await page.locator('#pdfButton').click();
                const download = await downloadPromise;
                assert.equal(await download.failure(), null);
                const pdfPath = path.join(output, `specification-${viewport.width}.pdf`);
                await download.saveAs(pdfPath);
                const bytes = fs.readFileSync(pdfPath);
                assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
                assert.ok(bytes.length > 10000, 'PDF must contain rendered results');
                const info = execFileSync('pdfinfo', [pdfPath], {encoding: 'utf8'});
                assert.match(info, /Pages:\s+1\b/, 'Export must be exactly one page');
                assert.match(info, /Page size:.*A4/, 'Export uses A4');
                execFileSync('pdftoppm', ['-png', '-scale-to', '1800', '-singlefile', pdfPath,
                    path.join(output, `pdf-preview-${viewport.width}`)]);
                const ocr = execFileSync('tesseract', [path.join(output, `pdf-preview-${viewport.width}.png`), 'stdout'], {encoding: 'utf8'});
                assert.match(ocr, /Laporan Kalkulasi/i, 'Full PDF title must be visible');
                assert.match(ocr, /Ukuran Fisik Akhir/i, 'Left summary card must be visible');
                assert.match(ocr, /Estimasi Kabel/i, 'Cable recommendations must appear in PDF');
                await page.waitForFunction(() => !pdfExportInProgress);
                assert.equal(await page.locator('.pdf-layout').count(), 0, 'Temporary export is cleaned up');
                await page.locator('#tabGrid').click();
                await page.locator('#gridCols').fill('30');
                await page.locator('#gridRows').fill('20');
                assert.equal(await page.locator('#gridPreview img').count(), 1);
                assert.match(await page.locator('#gridPreview img').getAttribute('alt'), /30 kolom × 20 baris/);
                await page.locator('#tabTarget').click();
                await page.screenshot({path: path.join(output, `${viewport.width}.png`), fullPage: true});
                assert.deepEqual(errors, [], 'No JavaScript page errors');
                const width = await page.evaluate(() => document.documentElement.scrollWidth);
                results.push({viewport, status: 'passed', documentWidth: width, horizontalOverflow: width > viewport.width});
                console.log(`PASS browser ${viewport.width}px; document width ${width}px`);
            } catch (error) {
                await page.screenshot({path: path.join(output, `${viewport.width}-failure.png`), fullPage: true}).catch(() => {});
                throw error;
            } finally {await page.close();}
        }
    } finally {
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {console.error(error); process.exitCode = 1;});
