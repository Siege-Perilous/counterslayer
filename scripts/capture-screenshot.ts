import { chromium } from '@playwright/test';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Capture console logs from the start
  const consoleLogs: string[] = [];
  page.on('console', async (msg) => {
    const text = msg.text();
    if (text.includes('arrangeLayerAuto') || text.includes('LayerContent')) {
      // Try to get full object details
      try {
        const args = msg.args();
        if (args.length > 1) {
          const fullText = await Promise.all(
            args.map(async (arg) => {
              try {
                return JSON.stringify(await arg.jsonValue(), null, 2);
              } catch {
                return arg.toString();
              }
            })
          );
          console.log('Console:', fullText.join(' '));
        } else {
          console.log('Console:', text);
        }
      } catch {
        console.log('Console:', text);
      }
      consoleLogs.push(text);
    }
  });

  try {
    await page.goto('http://localhost:5175');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Wait for geometry to generate
    await page.waitForTimeout(3000);

    // Capture the default view
    await page.screenshot({ path: 'mesh-analysis/view-current.png' });

    // Try to click "Dimensions" to see all layers view
    try {
      // Look for the Dimensions tab/button
      const dimensionsBtn = page.locator('text=Dimensions').first();
      if (await dimensionsBtn.isVisible()) {
        await dimensionsBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'mesh-analysis/view-dimensions.png' });
        console.log('Captured Dimensions view');
      } else {
        console.log('Dimensions button not visible');
      }
    } catch (e) {
      console.log('Could not find Dimensions button:', e);
    }

    console.log('Screenshots saved to mesh-analysis/');
    console.log('Console logs captured:', consoleLogs.length);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
