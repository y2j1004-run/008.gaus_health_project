// ===== 챌린지 설정 (필요하면 여기만 바꾸세요) =====
export const CHALLENGE = {
  title: '크롱과 함께하는 가우스 근력챌린지',
  startDate: '2026-11-30', // 1주차 시작일 (월요일 권장)
  weeks: 10,
  perWeek: 2,
};
CHALLENGE.totalGoal = CHALLENGE.weeks * CHALLENGE.perWeek;

// ===== Firebase 설정 =====
// Firebase 콘솔 → 프로젝트 설정(⚙️) → 일반 → 내 앱 → 웹 앱의 "SDK 설정 및 구성"(구성) 값을 그대로 붙여넣으세요.
// (이 값은 공개되어도 괜찮아요. 데이터 보호는 firestore.rules 보안 규칙이 담당합니다.)
export const firebaseConfig = {
  apiKey: 'AIzaSyC7FqT0fyjinew5zZAD5SpNSwfiXlO1B08',
  authDomain: 'gaushealth-2dfa5.firebaseapp.com',
  projectId: 'gaushealth-2dfa5',
  storageBucket: 'gaushealth-2dfa5.firebasestorage.app',
  messagingSenderId: '381332218979',
  appId: '1:381332218979:web:a168ea9bbe967786d50456',
};
