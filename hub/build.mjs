// Wraps page.html into a full document in public/, which Cloudflare serves as static files.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const here = new URL(".", import.meta.url);
const page = await readFile(new URL("page.html", here), "utf8");
const cut = page.indexOf("</style>") + "</style>".length;
const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#070912">
${page.slice(0, cut)}
</head>
<body>
${page.slice(cut).trim()}
</body>
</html>
`;
await mkdir(new URL("public/", here), { recursive: true });
await writeFile(new URL("public/index.html", here), html);
console.log("hub/public/index.html", (html.length / 1024).toFixed(0), "KB");
