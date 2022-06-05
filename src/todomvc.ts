import { readFileSync } from "fs";
import puppeteer, { KeyInput } from "puppeteer";

const targets = {
    elm: { url: "http://localhost:8001" },
    derw: { url: "http://localhost:8000" },
    react: { url: "http://localhost:8002" },
};

const words = readFileSync("words.txt", "utf-8").split("\n").slice(0, 100);

async function runTest(target: string) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const timeout = 5000;
    page.setDefaultTimeout(timeout);

    async function waitForSelectors(selectors, frame, options) {
        for (const selector of selectors) {
            try {
                return await waitForSelector(selector, frame, options);
            } catch (err) {
                console.error(err);
            }
        }
        throw new Error(
            "Could not find element for selectors: " + JSON.stringify(selectors)
        );
    }

    async function scrollIntoViewIfNeeded(element, timeout) {
        await waitForConnected(element, timeout);
        const isInViewport = await element.isIntersectingViewport({
            threshold: 0,
        });
        if (isInViewport) {
            return;
        }
        await element.evaluate((element) => {
            element.scrollIntoView({
                block: "center",
                inline: "center",
                behavior: "auto",
            });
        });
        await waitForInViewport(element, timeout);
    }

    async function waitForConnected(element, timeout) {
        await waitForFunction(async () => {
            return await element.getProperty("isConnected");
        }, timeout);
    }

    async function waitForInViewport(element, timeout) {
        await waitForFunction(async () => {
            return await element.isIntersectingViewport({ threshold: 0 });
        }, timeout);
    }

    async function waitForSelector(selector, frame, options) {
        if (!Array.isArray(selector)) {
            selector = [selector];
        }
        if (!selector.length) {
            throw new Error("Empty selector provided to waitForSelector");
        }
        let element: any = null;
        for (let i = 0; i < selector.length; i++) {
            const part = selector[i];
            if (element) {
                element = await element.waitForSelector(part, options);
            } else {
                element = await frame.waitForSelector(part, options);
            }
            if (!element) {
                throw new Error(
                    "Could not find element: " + selector.join(">>")
                );
            }
            if (i < selector.length - 1) {
                element = (
                    await element.evaluateHandle((el) =>
                        el.shadowRoot ? el.shadowRoot : el
                    )
                ).asElement();
            }
        }
        if (!element) {
            throw new Error("Could not find element: " + selector.join("|"));
        }
        return element;
    }

    async function waitForElement(step, frame, timeout) {
        const count = step.count || 1;
        const operator = step.operator || ">=";
        const comp = {
            "==": (a, b) => a === b,
            ">=": (a, b) => a >= b,
            "<=": (a, b) => a <= b,
        };
        const compFn = comp[operator];
        await waitForFunction(async () => {
            const elements = await querySelectorsAll(step.selectors, frame);
            return compFn(elements.length, count);
        }, timeout);
    }

    async function querySelectorsAll(selectors, frame) {
        for (const selector of selectors) {
            const result = await querySelectorAll(selector, frame);
            if (result.length) {
                return result;
            }
        }
        return [];
    }

    async function querySelectorAll(selector, frame) {
        if (!Array.isArray(selector)) {
            selector = [selector];
        }
        if (!selector.length) {
            throw new Error("Empty selector provided to querySelectorAll");
        }
        let elements: any[] = [];
        for (let i = 0; i < selector.length; i++) {
            const part = selector[i];
            if (i === 0) {
                elements = await frame.$$(part);
            } else {
                const tmpElements = elements;
                elements = [];
                for (const el of tmpElements) {
                    elements.push(...(await el.$$(part)));
                }
            }
            if (elements.length === 0) {
                return [];
            }
            if (i < selector.length - 1) {
                const tmpElements: any[] = [];
                for (const el of elements) {
                    const newEl = (
                        await el.evaluateHandle((el) =>
                            el.shadowRoot ? el.shadowRoot : el
                        )
                    ).asElement();
                    if (newEl) {
                        tmpElements.push(newEl);
                    }
                }
                elements = tmpElements;
            }
        }
        return elements;
    }

    async function waitForFunction(fn, timeout) {
        let isActive = true;
        setTimeout(() => {
            isActive = false;
        }, timeout);
        while (isActive) {
            const result = await fn();
            if (result) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("Timed out");
    }
    {
        const targetPage = page;
        await targetPage.setViewport({ width: 834, height: 1007 });
    }
    {
        const targetPage = page;
        const promises: Promise<any>[] = [];
        promises.push(targetPage.waitForNavigation());
        await targetPage.goto(targets[target].url);
        await Promise.all(promises);
        await page.tracing.start({
            path: `${target}-trace.json`,
            screenshots: true,
        });
    }
    {
        const targetPage = page;
        const element = await waitForSelectors(
            [
                ["aria/What needs to be done?"],
                ["#root > section > header > input"],
            ],
            targetPage,
            { timeout, visible: true }
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 298, y: 22 } });
    }
    {
        const targetPage = page;
        const element = await waitForSelectors(
            [
                ["aria/What needs to be done?"],
                ["#root > section > header > input"],
            ],
            targetPage,
            { timeout, visible: true }
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 298, y: 22 } });

        for (const word of words) {
            for (const letter of word) {
                await targetPage.keyboard.down(letter as KeyInput);
            }
            await targetPage.keyboard.down("Enter");
            await element.click({ offset: { x: 298, y: 22 } });
        }
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up("Enter");
    }
    {
        await page.tracing.stop();
    }

    await page.pdf({ path: `${target}-view.pdf`, format: "a4" });
    await browser.close();
}

async function main() {
    const targetsFromCli = process.argv.slice(2).join(",");

    for (let target of targetsFromCli.split(",")) {
        target = target.trim();
        if (target.length === 0) continue;
        if (Object.keys(targets).indexOf(target) === -1) {
            console.log("Unknown target", target);
            console.log("Available targets:", JSON.stringify(targets, null, 4));
            continue;
        }
        console.log("Running", target);
        await runTest(target);
    }
}

main();
