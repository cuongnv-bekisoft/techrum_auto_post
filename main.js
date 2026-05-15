require("dotenv").config();
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const FORUMS_FILE = path.join(__dirname, "forums.json");

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 700,
    height: 600,
    title: "Techrum Auto Poster",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile("src/ui.html");
});

ipcMain.on("post-article", (event, { title, bbcode, forum_id }) => {
  const scriptPath = path.join(__dirname, "src", "poster.js");

  event.reply("post-status", { type: "loading", message: "⏳ Đang đăng bài..." });

  console.log("IPC post-article received:", { title, bbcode, forum_id });

  // On Windows, it's safer to use spawn without shell: true if not needed,
  // and let Node.js handle argument escaping/quoting automatically.
  const child = spawn("node", [scriptPath, title, bbcode, forum_id], {
    shell: false, 
  });

  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (data) => {
    const text = data.toString();
    output += text;
    console.log("stdout:", text);
    event.reply("post-log", text);
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    errorOutput += text;
    console.error("stderr:", text);
    event.reply("post-log", text);
  });

  child.on("close", (code) => {
    console.log("Exit code:", code);
    console.log("Full output:", output);

    if (code !== 0) {
      event.reply("post-status", {
        type: "error",
        message: "❌ Lỗi khi chạy script: " + (errorOutput || output),
      });
      return;
    }

    // Tìm URL trong output
    const urlMatch = output.match(/URL: (https?:\/\/\S+)/);
    if (urlMatch) {
      event.reply("post-status", {
        type: "success",
        message: "✅ Đăng bài thành công!",
        url: urlMatch[1],
      });
    } else if (output.includes("thành công")) {
      event.reply("post-status", {
        type: "success",
        message: "✅ Đăng bài thành công! (Không lấy được URL)",
      });
    } else {
      event.reply("post-status", {
        type: "error",
        message: "❌ Không xác định kết quả: " + output.substring(0, 200),
      });
    }
  });

  child.on("error", (err) => {
    event.reply("post-status", {
      type: "error",
      message: "❌ Không chạy được Node.js: " + err.message,
    });
  });
});

ipcMain.on("get-forums", (event) => {
  try {
    if (!fs.existsSync(FORUMS_FILE)) {
      fs.writeFileSync(FORUMS_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(FORUMS_FILE, "utf-8");
    event.reply("forums-data", JSON.parse(data));
  } catch (err) {
    console.error("Lỗi đọc forums.json:", err);
  }
});

ipcMain.on("save-forums", (event, forums) => {
  try {
    fs.writeFileSync(FORUMS_FILE, JSON.stringify(forums, null, 2));
    event.reply("forums-data", forums);
  } catch (err) {
    console.error("Lỗi ghi forums.json:", err);
  }
});