#!/usr/bin/env node
// Reuse the project mark for native app icons; no icon generator dependency.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "desktop/assets");
await fs.mkdir(out, { recursive: true });
const logo = await fs.readFile(path.join(root, "public/brand.svg"), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:100vw;height:100vh;display:grid;place-items:center;background:transparent"><div style="width:100%;height:100%">${logo}</div></body></html>`);
  await page.addStyleTag({ content: "svg {width:100%;height:100%;}" });
  const png = await page.screenshot({ omitBackground: true });
  await fs.writeFile(path.join(out, "icon.png"), png);
  const images = new Map([[1024, png]]);
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    await page.setViewportSize({ width: size, height: size });
    images.set(size, await page.screenshot({ omitBackground: true }));
  }
  const chunks = [[16, "icp4"], [32, "icp5"], [64, "icp6"], [128, "ic07"], [256, "ic08"], [512, "ic09"], [1024, "ic10"]].map(([size, type]) => {
    const image = images.get(size);
    const header = Buffer.alloc(8);
    header.write(type); header.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([header, image]);
  });
  const icns = Buffer.alloc(8);
  icns.write("icns"); icns.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  await fs.writeFile(path.join(out, "icon.icns"), Buffer.concat([icns, ...chunks]));
  const sizes = [16, 32, 48, 64, 128, 256];
  const ico = Buffer.alloc(6 + 16 * sizes.length);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(sizes.length, 4);
  let offset = ico.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    const image = images.get(size);
    ico[entry] = ico[entry + 1] = size === 256 ? 0 : size;
    ico.writeUInt16LE(1, entry + 4); ico.writeUInt16LE(32, entry + 6);
    ico.writeUInt32LE(image.length, entry + 8); ico.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await fs.writeFile(path.join(out, "icon.ico"), Buffer.concat([ico, ...sizes.map((size) => images.get(size))]));
} finally { await browser.close(); }
