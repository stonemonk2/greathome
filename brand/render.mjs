import sharp from 'sharp';
import { readFileSync } from 'fs';
const jobs = [
  ['greathome-logo-primary.svg','greathome-logo-primary.png',1024],
  ['greathome-logo-secondary.svg','greathome-logo-secondary.png',2400],
];
for (const [src,out,w] of jobs) {
  const buf = readFileSync(new URL(src, import.meta.url));
  await sharp(buf, { density: 600 }).resize({ width: w }).png().toFile(new URL(out, import.meta.url).pathname.replace(/^\//,''));
  console.log('wrote', out);
}
