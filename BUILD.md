# PosidOffice 빌드 방법

## 준비

```bash
npm install
```

- Node.js와 npm이 필요합니다. 저장소는 npm 워크스페이스입니다.
- 껍데기 앱(`apps/shell`, `@genoffice/shell`)만 설치 파일로 나갑니다. 각 에디터의 메인 프로세스 코드는 shell 번들에 포함됩니다.

## 개발 실행

```bash
npm run dev -w @genoffice/shell
```

- 개발 실행의 프로필은 `%APPDATA%\PosidOffice-Dev`에 저장됩니다(설치본은 `%APPDATA%\PosidOffice`).
- 첫 실행 팝업을 다시 보려면 `app-settings.json`의 `"onboardingSeen": true`를 `false`로 바꿉니다.

## 빠른 검증

```bash
npm run typecheck -w @genoffice/shell     # 타입검사
npm run test -w @genoffice/shell        # shell 테스트
npm run format                          # 포맷 정리 (변경 파일만)
npm run format:check                    # 포맷 확인
npm run check:theme-colors
npm run check:no-genspark
npm run check:english-comments
npm run check:help-langs                # 21개 언어 문구 대조
```

## 설치 파일 빌드

```bash
node tools/build-posid.mjs --version 0.3.0 --date 2026-10-25
```

| 인자 | 기본값 | 설명 |
|---|---|---|
| `--version X.Y.Z` | `apps/shell/package.json`의 현재 버전 | 넘기면 package.json 버전을 갱신한 뒤 빌드합니다. `app.getVersion()`이 이 값을 반환하므로 **도움말 → PosidOffice 정보 팝업의 버전**과 설치 파일 메타데이터에 그대로 들어갑니다. 변경은 작업 트리에 남습니다. |
| `--date YYYY-MM-DD` | 빌드 당일 | `GENOFFICE_BUILD_DATE`로 전달돼 `__GENOFFICE_BUILD_DATE__`에 박히고, 정보 팝업의 `버전 X.Y.Z · YYYY-MM-DD`에 표시됩니다. |
| `--target win\|mac\|linux` | 현재 운영체제 | electron-builder 대상. |
| `--no-dist` | 끄기 | electron-builder를 건너뛰고 번들(`apps/shell/out`)만 만듭니다. 빠른 확인용. |

스크립트는 순서대로 `notices`(제3자 고지 생성) → `npm run build:all`(모든 에디터·CLI·shell 번들) → `electron-builder`를 실행합니다. `electron-builder`는 `packages/cli/dist`와 각 에디터의 `out/`을 `extraResources`로 요구하므로 shell만 빌드해서는 실패합니다. 결과물은 `apps/shell/dist` 아래에 생깁니다.

개별 단계만 직접 돌리려면:

```bash
npm run notices -w @genoffice/shell
npm run build:all                        # 전체 워크스페이스 번들
npm run dist:win                         # notices + build:all + Windows 설치 파일(루트 스크립트)
```

## 브랜드 에셋 재생성

앱 아이콘·로고는 `posid/` 폴더의 원본에서 생성됩니다. 바꿨다면:

```bash
node tools/gen-brand-assets.mjs
```

- `posid/posid_logo_512.png` → `icon.png`/`icon.ico`/`icon.icns`, Linux 아이콘 세트, 각 앱의 `app-icon.png`
- `posid/posid_ename.png` → 사이드바 lockup(`PoSiD Office`)

## 참고

- **제품명·정체성**: `packages/i18n/src/product.ts`에서만 바꿉니다.
- **정보 팝업 문구**: `packages/electron-utils/src/app-menu.ts`의 `ABOUT_TAGLINE`.
- **첫 실행 Ollama 안내 문구**: `apps/shell/src/renderer/src/i18n/ollama/<언어>.ts`(21개 언어).
- **업데이트 배포**: `.claude/skills/release-ieumoffice/SKILL.md`와 `docs/releasing.ko.md` 참고.
