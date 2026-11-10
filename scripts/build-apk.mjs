#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version || "1.2.1";

// 强制使用 JDK 17（Gradle 8.x 要求 Java 17/21，不支持 Java 25）
if (existsSync("D:\\Tool\\jdk-17")) {
  process.env.JAVA_HOME = "D:\\Tool\\jdk-17";
  process.env.PATH = `D:\\Tool\\jdk-17\\bin;${process.env.PATH}`;
}
if (existsSync("C:\\Android\\Sdk")) {
  process.env.ANDROID_HOME = "C:\\Android\\Sdk";
  process.env.ANDROID_SDK_ROOT = "C:\\Android\\Sdk";
}
if (existsSync("C:\\Android\\Sdk\\ndk\\28.2.13676358")) {
  process.env.NDK_HOME = "C:\\Android\\Sdk\\ndk\\28.2.13676358";
}

console.log("[build-apk] 正在调用 Tauri 构建 APK...");
const buildResult = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["tauri", "android", "build", "--apk", "--target", "aarch64"],
  { cwd: root, stdio: "inherit", shell: true, env: process.env }
);

if (buildResult.status !== 0) {
  console.error("[build-apk] 构建失败！");
  process.exit(buildResult.status ?? 1);
}

// 寻找生成的 APK
const apkDir = join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "apk");
const findApks = (dir) => {
  let results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findApks(full));
    } else if (entry.name.endsWith(".apk")) {
      results.push(full);
    }
  }
  return results;
};

const apks = findApks(apkDir).filter((f) => f.includes("release"));
if (apks.length === 0) {
  console.error("[build-apk] 未找到 release APK！");
  process.exit(1);
}

const artifactsDir = join(root, "artifacts");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

const apksigner = "C:\\Android\\Sdk\\build-tools\\36.0.0\\apksigner.bat";
const debugKs = join(os.homedir(), ".android", "debug.keystore");

for (const apk of apks) {
  const outName = basename(apk).replace("-unsigned", "-signed");
  const destName = outName.includes("universal") ? `HGhub_v${version}_arm64-v8a.apk` : outName;
  const destPath = join(artifactsDir, destName);
  const rootDestPath = join(root, destName);
  
  if (existsSync(apksigner) && existsSync(debugKs)) {
    console.log(`[build-apk] 正在为 ${basename(apk)} 签名...`);
    const signResult = spawnSync(apksigner, [
      "sign",
      "--ks", debugKs,
      "--ks-key-alias", "androiddebugkey",
      "--ks-pass", "pass:android",
      "--key-pass", "pass:android",
      "--out", destPath,
      apk,
    ], { stdio: "inherit", shell: true });
    if (signResult.status !== 0 || !existsSync(destPath)) {
      console.error(`[build-apk] 签名失败 (exit code: ${signResult.status})`);
      process.exit(signResult.status ?? 1);
    }
    copyFileSync(destPath, rootDestPath);
    console.log(`[build-apk] 已签名产物已保存至: ${destPath} 及根目录 ${destName}`);
  } else {
    copyFileSync(apk, destPath);
    copyFileSync(apk, rootDestPath);
    console.log(`[build-apk] 产物已复制至: ${destPath} (未签名)`);
  }
}
