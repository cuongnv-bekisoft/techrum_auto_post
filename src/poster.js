require("dotenv").config();
const puppeteer = require("puppeteer");
const path = require("path");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID; // Đã viết xong

// Thư mục lưu profile (cookie, session) — nằm cạnh file poster.js
const USER_DATA_DIR = path.join(__dirname, "..", "chrome-profile");

async function addTrelloCard(name, desc) {
  const url = `https://api.trello.com/1/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idList: TRELLO_LIST_ID,
      name,
      desc,
    }),
  });
  const data = await res.json();
  if (data.id) {
    console.log("📋 Đã tạo thẻ Trello:", data.shortUrl);
  } else {
    console.error("❌ Tạo thẻ Trello thất bại:", JSON.stringify(data));
  }
}

async function post() {
  const title = process.argv[2];
  const bbcode = process.argv[3];
  const forum_id = process.argv[4];

  if (!title || !bbcode || !forum_id) {
    console.log('Dùng: node src/poster.js "Tiêu đề" "BBCode" "forum_id"');
    console.log('Số lượng đối số:', process.argv.length);
    console.log('Toàn bộ argv:', process.argv);
    console.log('Đã nhận:', { title, bbcode, forum_id });
    process.exit(1);
  }
  console.log(`[0] Khởi động với Forum ID: ${forum_id}`);

  const browser = await puppeteer.launch({
    headless: "new",
    userDataDir: USER_DATA_DIR, // ← Lưu cookie/session vào đây
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  console.log("[1] Kiểm tra trạng thái đăng nhập...");
  await page.goto("https://www.techrum.vn/", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
 
  const isAlreadyLoggedIn = await page.$(".p-navgroup--member");

  if (!isAlreadyLoggedIn) {
    console.log("[1] Vào trang login...");
    await page.goto("https://www.techrum.vn/login", {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    await page.waitForSelector('input[name="login"]', { timeout: 10000 });
    await page.type('input[name="login"]', process.env.TECHRUM_LOGIN, { delay: 50 });
    await page.type('input[name="password"]', process.env.TECHRUM_PASSWORD, { delay: 50 });

    await Promise.all([
      page.evaluate(() => {
        document.querySelector('form[action="/login/login"] button.button--primary').click();
      }),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
    ]);

    const loginOk = await page.$(".p-navgroup--member");
    if (!loginOk) throw new Error("Đăng nhập thất bại!");
    console.log("[1] Đăng nhập thành công! Cookie đã được lưu cho lần sau.");
  }else {
    console.log("[1] Đã đăng nhập sẵn (dùng session cũ).");
  }
  // ── Bước 2: Vào trang đăng bài ─────────────────
  console.log("[2] Vào trang đăng bài...");
  await page.goto(
    `https://www.techrum.vn/forums/${forum_id}/post-thread`,
    { waitUntil: "networkidle0", timeout: 60000 }
  );

  await page.waitForSelector('input[name="title"]', { timeout: 10000 });

  // ── Bước 4: Lấy token và submit ────────────────
  const formInfo = await page.evaluate(() => {
    const form = document.querySelector('form[data-xf-init*="ajax-submit"]');
    if (!form) return null;
    const tokenEl = form.querySelector('input[name="_xfToken"]');
    return {
      action: form.getAttribute("action"),
      token: tokenEl ? tokenEl.value : null,
    };
  });

  if (!formInfo || !formInfo.token) {
    throw new Error("Không tìm thấy form — kiểm tra forum_id");
  }
  console.log("[4] Form action:", formInfo.action);

  // ── Bước 5: Submit bằng fetch ──────────────────
  console.log("[5] Đang submit bài...");
  const result = await page.evaluate(
    async (action, t, b, token) => {
      const formData = new URLSearchParams();
      formData.append("title", t);
      formData.append("message", b);
      formData.append("watch_thread", "1");
      formData.append("_xfToken", token);
      formData.append("_xfRequestUri", action);
      formData.append("_xfWithData", "1");
      formData.append("_xfResponseType", "json");

      const res = await fetch("https://www.techrum.vn" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: formData.toString(),
        credentials: "include",
      });

      const text = await res.text();
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch {
        return { ok: false, raw: text.substring(0, 300) };
      }
    },
    formInfo.action, title, bbcode, formInfo.token
  );

  if (!result.ok) {
    throw new Error("Response lỗi: " + result.raw);
  }

  const xfResponse = result.data;
  const redirectUrl =
    xfResponse.redirect ||
    xfResponse._redirectTarget ||
    xfResponse.redirectTarget;

  if (redirectUrl) {
    let fullUrl = redirectUrl.startsWith("http")
      ? redirectUrl
      : "https://www.techrum.vn" + redirectUrl;

    // Rút gọn URL: https://www.techrum.vn/threads/slug.id/ -> https://www.techrum.vn/threads/.id/
    fullUrl = fullUrl.replace(/\/threads\/.*\.(\d+\/?)$/, "/threads/.$1");

    console.log("✅ Đăng bài thành công!");
    console.log("URL:", fullUrl);

    // ── Bước 6: Tạo thẻ Trello ─────────────────
    console.log("[6] Đang tạo thẻ Trello...");
    await addTrelloCard(title, fullUrl);
  } else {
    console.log("❌ Lỗi:", JSON.stringify(xfResponse).substring(0, 300));
  }

  await browser.close();
}

post().catch(console.error);