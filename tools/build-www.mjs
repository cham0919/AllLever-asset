// 앱(아이폰·안드로이드)에 넣을 웹 파일을 www/ 폴더로 모아요.
// 웹 버전(GitHub Pages)은 저장소 루트를 그대로 쓰고, 앱은 이 www/ 복사본을 써요.
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
const OUT = 'www';
const FILES = ['index.html', 'privacy.html', 'theme-boot.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'demo.xlsx', 'demo2025.xlsx', 'template.xlsx'];
const DIRS = ['js', 'fonts', 'vendor'];
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
for (const f of FILES) cpSync(f, `${OUT}/${f}`);
for (const d of DIRS) if (existsSync(d)) cpSync(d, `${OUT}/${d}`, { recursive: true });
// 앱 버전 표시 (설정 › 버전). 웹은 서비스워커 캐시 이름에서 읽어요
const ver = JSON.parse(readFileSync('package.json', 'utf8')).version;
appendFileSync(`${OUT}/theme-boot.js`, `\nwindow.ALV_APP_VERSION = '${ver}';\n`);
console.log(`www/ 준비 완료 (앱 버전 ${ver})`);
