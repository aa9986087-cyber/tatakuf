# النشر المجاني على Cloudflare Workers + D1

اللعبة كلها Worker واحد: يخدم الواجهة والأسئلة والصور والـ API من `dist/server/index.js`، ويحفظ الغرف في قاعدة D1 مربوطة باسم `DB`. الخطة المجانية في Cloudflare تكفي، ولا تحتاج ChatGPT Sites ولا أي اشتراك.

الإعدادات جاهزة في [`wrangler.jsonc`](wrangler.jsonc):

- `main` يشير للنسخة المبنية، و`build.command` يشغّل `npm run build` تلقائيًا قبل كل نشر.
- `d1_databases` يربط قاعدة اسمها `tatakuf` بالمتغير `DB`، مع `migrations_dir: "drizzle"`.
- لا يوجد `database_id`: Wrangler ينشئ القاعدة تلقائيًا في أول نشر ويربطها. والـ Worker نفسه ينشئ جدول `rooms` إذا كانت القاعدة جديدة (نفس محتوى `drizzle/0000_rooms.sql`)، فما تحتاج خطوة ترحيل منفصلة.
- `.node-version` يطلب Node.js 24 في بيئة البناء.

## الطريقة الأولى: ربط GitHub بـ Cloudflare (نشر تلقائي مع كل دفع)

1. سجّل في [dash.cloudflare.com](https://dash.cloudflare.com) بحساب مجاني.
2. من القائمة **Compute (Workers) → Workers & Pages** اضغط **Create** ثم **Import a repository** (أو **Connect to Git**).
3. اربط حساب GitHub واختر مستودع اللعبة، والفرع `main`.
4. اترك الإعدادات كالتالي:
   - **Project name:** `tatakuf` (لازم يطابق `name` في `wrangler.jsonc`).
   - **Build command:** `npm ci` (أو اتركه فارغًا؛ البناء يتم داخل أمر النشر).
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/`
5. اضغط **Deploy**. بعد دقيقة تقريبًا يظهر الرابط بالشكل `https://tatakuf.<اسم-حسابك>.workers.dev`.
6. افتح الرابط وأنشئ غرفة «شاشة المجلس» للتأكد. أي دفع لاحق على `main` ينشر تلقائيًا.

> إذا ظهر خطأ يخص قاعدة البيانات في أول نشر، أنشئها يدويًا من **Storage & Databases → D1 → Create** باسم `tatakuf`، انسخ الـ ID وأضفه في `wrangler.jsonc` كـ `"database_id": "..."` ثم ادفع التعديل.

## الطريقة الثانية: النشر من جهازك بسطر واحد

```bash
npm ci
npx wrangler login      # يفتح المتصفح لتسجيل الدخول مرة وحدة
npm run deploy          # يبني اللعبة وينشرها وينشئ D1 إذا ما كانت موجودة
```

اختياري: لتطبيق ملف الترحيل يدويًا على القاعدة البعيدة `npx wrangler d1 migrations apply DB --remote` (آمن للتكرار).

## تجربة محلية بنفس بيئة Cloudflare

`npm run cf:dev` يشغّل اللعبة على http://localhost:8787 داخل workerd مع قاعدة D1 محلية في `.wrangler/`. المعاينة الخفيفة القديمة `npm run dev` ما زالت تعمل على المنفذ 4173.

## نطاق خاص (اختياري)

من صفحة الـ Worker: **Settings → Domains & Routes → Add → Custom domain** إذا كان عندك نطاق مضاف في Cloudflare. رابط `workers.dev` يبقى مجانيًا ودائمًا.

## حدود الخطة المجانية

١٠٠ ألف طلب يوميًا للـ Workers، و٥ ملايين قراءة و١٠٠ ألف كتابة يوميًا لـ D1، وحجم الـ Worker المضغوط حاليًا نحو ٣٢٠ كيلوبايت من أصل ٣ ميغابايت. كل جوال يطلب حالة الغرفة مرة كل ثانية أثناء اللعب، فالحدود تكفي لعشرات المباريات يوميًا.
