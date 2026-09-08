import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome, sleep } from './fakes/chrome.js';

/**
 * Each scenario needs its own module instance because WindowsManager keeps state
 * at module scope (activeRequestId, currentPlatform). The query string forces
 * Node to load a fresh copy.
 */
async function runScenario(options, drive) {
    const fake = createFakeChrome(options);
    globalThis.chrome = fake.api;
    const manager = await import(`../src/background/WindowsManager.js?case=${Math.random()}`);
    await drive(manager);
    await sleep(400);
    return fake;
}

const MOBILE = { url: 'https://site/bug', width: 375, height: 812, errorId: 'e1' };

describe('luồng mở cửa sổ lỗi', () => {
    test('chưa có cửa sổ thì tạo mới, và không phải resize lại lần nào', async () => {
        const fake = await runScenario({}, (manager) => manager.handleWindowMessage(MOBILE));

        const created = fake.calls.find((call) => call.op === 'windows.create');
        assert.equal(created.type, 'popup', "phải là 'popup'; 'panel' Chrome đã bỏ hỗ trợ");

        // The decoration estimate was already right, so only the focus update remains.
        const resizes = fake.calls.filter((call) => call.op === 'windows.update' && call.width);
        assert.equal(resizes.length, 0);
        assert.equal(fake.leakedListeners(), 0);
    });

    test('tái dùng cửa sổ: điều hướng TRƯỚC rồi mới đo và chỉnh kích thước', async () => {
        const fake = await runScenario({ storedWindowId: 42 }, (manager) =>
            manager.handleWindowMessage(MOBILE),
        );

        const ops = fake.ops();
        const navigateAt = ops.indexOf('tabs.update');
        const measureAt = ops.indexOf('executeScript.measure');
        assert.ok(navigateAt !== -1 && measureAt !== -1);
        assert.ok(
            navigateAt < measureAt,
            'đo trang cũ rồi mới điều hướng sẽ cho số hiệu chỉnh sai',
        );

        // Converges on the breakpoint within two passes.
        const measures = fake.calls.filter((call) => call.op === 'executeScript.measure');
        assert.deepEqual(measures.at(-1).inner, { width: 375, height: 812 });
        assert.equal(fake.leakedListeners(), 0);
    });

    test('tab đã ở đúng URL thì không điều hướng lại', async () => {
        const fake = await runScenario({ storedWindowId: 42, tabUrl: MOBILE.url }, (manager) =>
            manager.handleWindowMessage(MOBILE),
        );
        assert.ok(!fake.ops().includes('tabs.update'));
    });

    test('click nhanh hai lỗi: lần sau đè lần trước, chỉ một highlight chạy', async () => {
        const fake = await runScenario({ storedWindowId: 42 }, async (manager) => {
            manager.handleWindowMessage({
                url: 'https://site/a',
                width: 375,
                height: 812,
                errorId: 'FIRST',
            });
            await sleep(2);
            manager.handleWindowMessage({
                url: 'https://site/b',
                width: 1440,
                height: 900,
                errorId: 'SECOND',
            });
        });

        const highlights = fake.calls.filter((call) => call.op === 'tabs.sendMessage');
        assert.equal(highlights.length, 1);
        assert.equal(highlights[0].errorId, 'SECOND');

        const measures = fake.calls.filter((call) => call.op === 'executeScript.measure');
        assert.deepEqual(measures.at(-1).inner, { width: 1440, height: 900 });
        assert.equal(fake.leakedListeners(), 0);
    });

    test('cửa sổ đã bị đóng thì tạo lại', async () => {
        const fake = await runScenario({ storedWindowId: 42, windowExists: false }, (manager) =>
            manager.handleWindowMessage({ ...MOBILE, width: 768, height: 1024 }),
        );

        assert.ok(fake.ops().includes('windows.create'));
        const measures = fake.calls.filter((call) => call.op === 'executeScript.measure');
        assert.deepEqual(measures.at(-1).inner, { width: 768, height: 1024 });
    });

    test('content script không trả lời thì rơi về executeScript', async () => {
        const fake = await runScenario(
            { storedWindowId: 42, contentScriptAnswers: false },
            (manager) => manager.handleWindowMessage(MOBILE),
        );
        await sleep(3600);

        assert.ok(
            fake.calls.filter((call) => call.op === 'tabs.sendMessage').length > 1,
            'phải thử lại nhiều lần trước khi bỏ cuộc',
        );
        assert.ok(fake.ops().includes('executeScript.highlight'));
        assert.equal(fake.leakedListeners(), 0);
    });
});
