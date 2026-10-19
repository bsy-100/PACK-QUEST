/* 명세의 "값 목록"과 "오류 코드" 표를 화면용으로 옮긴 것.
   API와 DB는 영어 코드값을 쓰고, 한글 표시는 화면이 맡는다. */

window.PQ = window.PQ || {};

PQ.LABELS = {
  region: { domestic: "국내", overseas: "해외" },
  transport: { plane: "비행기", car: "자동차", train: "기차" },
  duration: { day: "당일", short: "1~2박", long: "3박 이상" },
  season: { spring_fall: "봄·가을", summer: "여름", winter: "겨울" },
  category: {
    documents: "서류",
    clothing: "의류",
    toiletries: "세면",
    electronics: "전자기기",
    health: "건강·안전",
    etc: "기타",
  },
  source: { recommended: "추천", custom: "직접 추가" },
};

// 서버의 items 정렬 순서(ENUM 정의 순서)와 같다.
PQ.CATEGORY_ORDER = ["documents", "clothing", "toiletries", "electronics", "health", "etc"];

// 오류 코드 → 사용자에게 보여줄 안내 문구 (명세 "화면 안내" 열)
PQ.ERROR_MESSAGES = {
  VALIDATION_ERROR: "입력값을 확인해 주세요.",
  TOKEN_MISSING: "다시 입장해 주세요.",
  TOKEN_INVALID: "다시 입장해 주세요.",
  TRIP_NOT_FOUND: "여행을 찾을 수 없어요. 코드를 확인해 주세요.",
  ITEM_NOT_FOUND: "이미 삭제된 항목이에요.",
  MEMBER_NOT_FOUND: "참여자를 다시 선택해 주세요.",
  NOT_FOUND: "일시적인 오류예요. 다시 시도해 주세요.",
  METHOD_NOT_ALLOWED: "일시적인 오류예요. 다시 시도해 주세요.",
  NICKNAME_TAKEN: "이미 쓰는 닉네임이에요.",
  ITEM_TAKEN: "다른 사람이 먼저 맡았어요.",
  NO_ASSIGNEE: "먼저 담당자를 정해 주세요.",
  HOST_ONLY: "주최자만 할 수 있어요.",
  NOT_ALLOWED: "자기 자신에게만 배정할 수 있어요.",
  NOT_YOUR_ITEM: "담당자만 체크할 수 있어요.",
  RATE_LIMITED: "잠시 후 다시 시도해 주세요.",
  SERVER_ERROR: "일시적인 오류예요. 다시 시도해 주세요.",
};

// 이 코드를 받으면 저장한 토큰을 지우고 입장 화면으로 보낸다.
PQ.REENTER_CODES = ["TOKEN_MISSING", "TOKEN_INVALID", "TRIP_NOT_FOUND"];

PQ.POLL_INTERVAL_MS = 5000;

// 입력 규칙 (명세 "필드 규칙")
PQ.LIMITS = {
  nicknameMax: 20,
  itemNameMax: 50,
  codeLength: 8,
};

PQ.errorMessage = function (code) {
  return PQ.ERROR_MESSAGES[code] || PQ.ERROR_MESSAGES.SERVER_ERROR;
};
