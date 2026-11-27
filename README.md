# 💪 크롱과 함께하는 가우스 근력챌린지

겨울에는 근력 UP! 봄에는 PB! — 여러 명이 한 페이지에 접속해 각자 운동 목표를 세우고, 운동한 날 달성 여부를 기록하고, 서로의 기록을 보며 응원하는 웹페이지입니다.
[006.get_muscle_challenge](https://github.com/y2j1004-run/006.get_muscle_challenge)와 내용·기간이 같고, 저장소만 **구글 시트 대신 Firebase**(Firestore + Authentication)를 씁니다.

## 기능

| 탭 | 내용 |
|---|---|
| 🏆 현황 | 참가자 전원의 **이번 주 요일표**(계획 요일 / 달성 ✅ / 일부 🟡 / 놓침 ❌), 개인별 진행률(인정 횟수 x/20), 10주 주차별 달성 점 |
| ✍️ 기록하기 | 날짜 선택 → 내 목표 항목별 **달성/미달성 체크** → 메모 → 저장 |
| 📰 피드 | 모든 참가자의 기록(항목별 ✅/❌, 메모), 👏 응원 + 💬 한줄 응원 코멘트, 참가자별 필터 |
| 👤 내 목표 | 참가 등록(이름 + 4자리 PIN), **운동 요일**과 **개인 목표** 설정·수정 |

- 기간 10주(2026-11-30 월 ~ 2027-02-07 일) · 주 2회 · 총 20회. 한 주에 2회까지 인정, 같은 날 여러 번 기록해도 1회.
- PIN은 내 기록 추가/삭제·목표 수정을 보호합니다. 한 번 입력하면 그 기기에 기억됩니다.
- Firestore **실시간 동기화** — 다른 사람이 기록하면 새로고침 없이 바로 보여요.

## 구조

```
docs/                (GitHub Pages로 공개되는 폴더)
  index.html   화면
  style.css    디자인
  app.js       동작 (Firebase SDK를 CDN에서 불러옴, 빌드 불필요)
  firebase-config.js  ★ 챌린지 설정 + Firebase 구성값 (여기만 고치면 됨)
firestore.rules  보안 규칙 (본인만 내 기록/목표 수정, 이름 중복 방지 등)
firebase.json    Firebase Hosting / Firestore / 에뮬레이터 설정
```

데이터(Firestore 컬렉션)

| 컬렉션 | 문서 ID | 내용 |
|---|---|---|
| `participants` | 로그인 계정 uid | `name`, `goals[{name,target}]`, `days[0~6]`, `createdAt`, `loginKey` |
| `names` | 이름 | `uid` (이름 중복 방지용) |
| `logs` | 자동 | `participantId`, `date`, `results[{name,target,achieved}]`, `note`, `createdAt`, `cheers[이름]`, `comments[{name,text,at}]` |

PIN은 Firestore에 저장되지 않아요. 참가자마다 Firebase Authentication 계정(내부용 가짜 이메일 + PIN 기반 비밀번호)을 만들고, 보안 규칙이 "로그인한 본인만 내 데이터 수정"을 강제합니다.

## 배포 (Firebase 무료 Spark 요금제 + GitHub Pages)

웹페이지는 GitHub Pages(`docs/` 폴더)로 띄우고, 데이터만 Firebase에 저장합니다. PC나 명령어 없이 콘솔 화면만으로 설정할 수 있어요.

1. https://console.firebase.google.com 에서 새 프로젝트를 만들어요. (애널리틱스는 꺼도 돼요.)
2. **Firestore Database**를 만들어요. 위치는 서울(`asia-northeast3`), 모드는 **프로덕션**으로 해 주세요.
3. Firestore의 **규칙** 탭에 저장소의 [`firestore.rules`](firestore.rules) 내용을 통째로 붙여넣고 **게시**해요.
   ⚠️ 게시하지 않으면 프로덕션 모드 기본 규칙 때문에 아무것도 저장되지 않아요.
4. **Authentication → 로그인 방법 → 이메일/비밀번호**를 켜요. ("이메일 링크"는 끈 채로 두세요.)
   참여자가 이메일을 입력하는 게 아니라, **이름 + PIN 4자리**를 내부용 계정으로 바꿔 쓰는 용도예요.
   덕분에 휴대폰을 바꾸거나 다른 기기에서도 이름 + PIN으로 다시 로그인할 수 있어요.
5. **프로젝트 설정(⚙️) → 일반 → 내 앱 → 웹(</>)** 으로 웹 앱을 추가하면 `firebaseConfig` 값이 나와요.
   이 값을 [`docs/firebase-config.js`](docs/firebase-config.js)의 `firebaseConfig`에 넣고 커밋해요. (공개돼도 괜찮은 값이에요. 데이터 보호는 3번의 보안 규칙이 담당해요.)
6. GitHub 저장소 **Settings → Pages → Build and deployment**: Source는 **Deploy from a branch**, 브랜치는 이 브랜치, 폴더는 **`/docs`** → Save.
   1~2분 뒤 **https://y2j1004-run.github.io/008.gaus_health_project/** 에서 열려요. 단톡방에 공유하세요!

확인: 링크를 열어 👤 **내 목표**에서 테스트로 등록 → 콘솔 Firestore에 `participants`, `names` 컬렉션이 생기고, Authentication에 사용자가 1명 추가됩니다.

> **승인된 도메인**(Authentication → 설정)에 `y2j1004-run.github.io`를 추가하는 건 선택이에요. 이메일/비밀번호 로그인은 이 목록과 상관없이 동작하고, 구글 로그인 같은 팝업 방식에서만 필요해요. 넣어 두어도 문제는 없어요.
>
> Firebase Hosting을 쓰고 싶다면(PC, Node.js 18+): `npm i -g firebase-tools && firebase login && firebase use --add && npm run deploy` → `https://<프로젝트ID>.web.app` (규칙도 함께 올라가요.)

## 설정 바꾸기

[`docs/firebase-config.js`](docs/firebase-config.js) 맨 위 `CHALLENGE` 값을 수정 후 커밋하면 GitHub Pages에 1~2분 뒤 반영돼요.

| 항목 | 기본값 | 설명 |
|---|---|---|
| `startDate` | `2026-11-30` | 1주차 시작일(월요일 권장) |
| `weeks` | `10` | 기간(주) |
| `perWeek` | `2` | 주당 목표 횟수 |

## 로컬에서 테스트 (에뮬레이터, 실제 데이터에 영향 없음)

Java 11+ 와 `firebase-tools` 필요.
```bash
npm run dev      # Auth·Firestore·Hosting 에뮬레이터 실행 (docs/ 폴더를 서비스)
```
http://localhost:5000 접속. `firebase-config.js`가 아직 비어 있으면 자동으로 에뮬레이터에 연결되고,
설정을 넣은 뒤에도 `http://localhost:5000/?emulator` 로 열면 에뮬레이터를 씁니다.

## 운영 팁
- **참가자가 PIN을 잊으면**: Firebase 콘솔 **Authentication → 사용자**에서 그 사람 계정의 ⋮ → 계정 삭제, **Firestore**에서 `participants/{uid}` 와 `names/{이름}` 문서를 삭제 → 다시 등록하게 하세요. (이전 기록은 새 계정과 연결되지 않아요.)
- 테스트 데이터 정리: Firestore 콘솔에서 해당 문서를 삭제하면 됩니다.
- 백업: 콘솔 Firestore에서 내보내기(유료 Blaze 필요) 대신, 소규모라면 각 컬렉션 화면을 확인하거나 `gcloud firestore export` 사용.
- 무료 한도: Firestore 읽기 하루 50,000회. 페이지를 열 때 전체 기록을 한 번 읽고 이후엔 바뀐 것만 읽으므로(브라우저 캐시 사용) 수십 명 규모 챌린지는 넉넉합니다.
- PIN 4자리를 반복해서 틀리면 Firebase가 자동으로 잠시 로그인을 막아요(무차별 대입 방지).
