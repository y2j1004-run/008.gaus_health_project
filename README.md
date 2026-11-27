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
public/
  index.html   화면
  style.css    디자인
  app.js       동작 (Firebase SDK를 CDN에서 불러옴, 빌드 불필요)
  config.js    ★ 챌린지 설정 + Firebase 구성값 (여기만 고치면 됨)
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

## 배포 (무료 Spark 요금제로 충분)

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com → **프로젝트 추가** → 이름(예: `crong-gaus-challenge`) → 애널리틱스는 꺼도 됨.
2. **빌드 → Authentication → 시작하기 → Sign-in method → 이메일/비밀번호 → 사용 설정 → 저장**
   (아래 "이메일 링크"는 켜지 않아도 됩니다.)
3. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**로 시작.
4. **프로젝트 설정(⚙️) → 일반 → 내 앱 → 웹(</>)** 아이콘 → 앱 닉네임 입력 → 등록.
   표시되는 `const firebaseConfig = { ... }` 값을 [`public/config.js`](public/config.js)의 `firebaseConfig`에 그대로 붙여넣습니다.

### 2. 보안 규칙 + 웹페이지 올리기 (PC, Node.js 18+)
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # 방금 만든 프로젝트 선택 (alias: default)
npm run deploy              # = firebase deploy --only hosting,firestore
```
끝나면 `https://<프로젝트ID>.web.app` 주소가 나와요. 단톡방에 공유하세요!

> CLI 없이 하고 싶다면: Firebase 콘솔 **Firestore Database → 규칙** 탭에 [`firestore.rules`](firestore.rules) 내용을 통째로 붙여넣고 **게시**한 뒤,
> `public/` 폴더를 정적 호스팅(GitHub Pages, Netlify Drop 등)에 올려도 동작합니다.
> ⚠️ 규칙을 게시하지 않으면 프로덕션 모드 기본 규칙 때문에 아무것도 저장되지 않아요.

### 3. 확인
링크를 열어 👤 **내 목표**에서 테스트로 등록 → 콘솔 Firestore에 `participants`, `names` 컬렉션이 생기고, Authentication에 사용자가 1명 추가됩니다.

## 설정 바꾸기

[`public/config.js`](public/config.js) 맨 위 `CHALLENGE` 값을 수정 후 다시 `npm run deploy`.

| 항목 | 기본값 | 설명 |
|---|---|---|
| `startDate` | `2026-11-30` | 1주차 시작일(월요일 권장) |
| `weeks` | `10` | 기간(주) |
| `perWeek` | `2` | 주당 목표 횟수 |

## 로컬에서 테스트 (에뮬레이터, 실제 데이터에 영향 없음)

Java 11+ 와 `firebase-tools` 필요.
```bash
npm run dev      # Auth·Firestore·Hosting 에뮬레이터 실행
```
http://localhost:5000 접속. `config.js`가 아직 비어 있으면 자동으로 에뮬레이터에 연결되고,
설정을 넣은 뒤에도 `http://localhost:5000/?emulator` 로 열면 에뮬레이터를 씁니다.

## 운영 팁
- **참가자가 PIN을 잊으면**: Firebase 콘솔 **Authentication → 사용자**에서 그 사람 계정의 ⋮ → 계정 삭제, **Firestore**에서 `participants/{uid}` 와 `names/{이름}` 문서를 삭제 → 다시 등록하게 하세요. (이전 기록은 새 계정과 연결되지 않아요.)
- 테스트 데이터 정리: Firestore 콘솔에서 해당 문서를 삭제하면 됩니다.
- 백업: 콘솔 Firestore에서 내보내기(유료 Blaze 필요) 대신, 소규모라면 각 컬렉션 화면을 확인하거나 `gcloud firestore export` 사용.
- 무료 한도: Firestore 읽기 하루 50,000회. 페이지를 열 때 전체 기록을 한 번 읽고 이후엔 바뀐 것만 읽으므로(브라우저 캐시 사용) 수십 명 규모 챌린지는 넉넉합니다.
- PIN 4자리를 반복해서 틀리면 Firebase가 자동으로 잠시 로그인을 막아요(무차별 대입 방지).
