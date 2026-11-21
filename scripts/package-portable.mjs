/**
 * 源码便携包：把构建产物打成一个「解压即用」的目录，不打包 Electron / Node 运行时。
 * **不改源码、也不改产物**——直接用构建出来的目录名 dist / dist-electron，主进程一跑就对得上。
 *
 * 产物结构（release/portable/）：
 *   软件/
 *     dist/          ← 渲染层产物（构建产物原样）
 *     dist-electron/ ← 主进程与 preload（构建产物原样）
 *     package.json   ← 原样拷贝（main = dist-electron/main.cjs）
 *   数据/            ← 空目录，运行时当 userData（--user-data-dir）
 *   运行.sh          ← Linux / macOS 共用
 *   运行.cmd         ← Windows
 *
 * 启动脚本调用系统里已安装的 Electron（命令 electron，或用 npx 兜底）。
 * 前置：目标机器需装 Electron（npm i -g electron）。
 */
import { cpSync, rmSync, mkdirSync, writeFileSync, chmodSync, copyFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = path.join(ROOT, 'release', 'portable')
const APP = path.join(OUT, '软件')

const fail = (m) => { console.error('[package-portable] ' + m); process.exit(1) }

if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) fail('dist/index.html 不存在，先 npm run build')
if (!existsSync(path.join(ROOT, 'dist-electron', 'main.cjs'))) fail('dist-electron/main.cjs 不存在，先 npm run build')

// 1. 干净的输出目录
rmSync(OUT, { recursive: true, force: true })
mkdirSync(APP, { recursive: true })
mkdirSync(path.join(OUT, '数据'), { recursive: true })

// 2. 应用代码 → 软件/（保持构建产物原名，主进程天然认得）
cpSync(path.join(ROOT, 'dist'), path.join(APP, 'dist'), { recursive: true })
cpSync(path.join(ROOT, 'dist-electron'), path.join(APP, 'dist-electron'), { recursive: true })
copyFileSync(path.join(ROOT, 'package.json'), path.join(APP, 'package.json'))

// 3. 启动脚本（Linux/macOS 共用 sh；Windows 用 cmd）
const writeScript = (name, body) => {
  const p = path.join(OUT, name)
  writeFileSync(p, body, 'utf-8')
  chmodSync(p, 0o755)
}

// 前置：已安装 Electron（npm i -g electron）
writeScript('运行.sh', `#!/bin/sh
File="$(realpath -- "$0")"
Root="$(dirname -- "$File")"
exec electron --user-data-dir="$Root/数据" "$Root/软件" "$@"
`)

writeFileSync(path.join(OUT, '运行.cmd'), `@echo off\r
chcp 65001\r
set "Root=%~dp0"\r
start "" electron --user-data-dir="%Root%\\数据" "%Root%\\软件" %*\r
`, 'utf-8')

// 4. 压缩成最高压缩率的 tar.xz（xz -9e，最高档 + extreme；实测与 7z LZMA2 -mx9 相当）
const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version
const REL = path.join(ROOT, 'release')
const archive = path.join(REL, `Unyra-${version}-portable.tar.xz`)
const z = spawnSync('sh', ['-c', `tar -C "${REL}" -cf - portable | xz -9e -T0 > "${archive}"`], { stdio: 'inherit' })
if (z.status !== 0) fail('压缩失败（需要系统有 tar 与 xz）')
console.log(`[package-portable] 已压缩：${path.basename(archive)}（${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB）`)

console.log('[package-portable] 完成：release/portable/')
console.log('  软件/{dist,dist-electron,package.json}  数据/  运行.sh  运行.cmd')
console.log('[package-portable] 不含 Electron/Node；运行时需系统已安装 electron')
