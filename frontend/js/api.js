/* API 호출과 토큰 보관. 명세 "공통 규칙"을 따른다.
   - 경로는 상대 경로(/api/...)
   - 토큰은 X-Pack-Token 헤더로만 보낸다
   - 토큰은 localStorage의 packquest:<공유 코드> 키에 저장한다 */

window.PQ = window.PQ || {};

PQ.ApiError = class ApiError extends Error {
  constructor(code, status, serverMessage) {
    super(PQ.errorMessage(code));
    this.code = code;
    this.status = status;
    this.serverMessage = serverMessage || ""; // 개발 확인용
  }
};

/* ---------- 토큰 보관 ---------- */

PQ.tokenStore = (function () {
  const TOKEN_PREFIX = "packquest:";
  const META_PREFIX = "packquest-meta:"; // 시작 화면 목록에 보여줄 닉네임 등

  // 사생활 보호 모드 등에서는 localStorage가 막혀 있을 수 있다.
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  return {
    get(code) {
      return safe(() => localStorage.getItem(TOKEN_PREFIX + code), null);
    },
    set(code, token, meta) {
      safe(() => {
        localStorage.setItem(TOKEN_PREFIX + code, token);
        if (meta) localStorage.setItem(META_PREFIX + code, JSON.stringify(meta));
      });
    },
    remove(code) {
      safe(() => {
        localStorage.removeItem(TOKEN_PREFIX + code);
        localStorage.removeItem(META_PREFIX + code);
      });
    },
    // 토큰이 저장된 여행 목록 [{code, nickname, isHost}]
    list() {
      return safe(() => {
        const trips = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key.startsWith(TOKEN_PREFIX)) continue;
          const code = key.slice(TOKEN_PREFIX.length);
          let meta = {};
          try { meta = JSON.parse(localStorage.getItem(META_PREFIX + code)) || {}; } catch (e) { /* 무시 */ }
          trips.push({ code, nickname: meta.nickname || "", isHost: !!meta.isHost });
        }
        return trips;
      }, []);
    },
  };
})();

/* ---------- 요청 ---------- */

// mock.js가 이 함수를 가짜 서버로 바꿔 끼운다.
PQ.fetchImpl = (url, init) => window.fetch(url, init);

PQ.normalizeCode = function (input) {
  return String(input || "").trim().toUpperCase();
};

PQ.request = async function (method, path, options = {}) {
  const { body, code } = options;
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (code) {
    const token = PQ.tokenStore.get(code);
    if (token) headers["X-Pack-Token"] = token;
  }

  let res;
  try {
    res = await PQ.fetchImpl(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // 네트워크 끊김, 서버 무응답
    throw new PQ.ApiError("SERVER_ERROR", 0, String(e));
  }

  // 204(항목 삭제, 여행 삭제)는 본문이 없다.
  if (res.status === 204) return null;

  let data = null;
  const isJson = (res.headers.get("Content-Type") || "").includes("application/json");
  if (isJson) {
    try { data = await res.json(); } catch (e) { data = null; }
  }

  if (res.ok) {
    if (data === null) throw new PQ.ApiError("SERVER_ERROR", res.status, "JSON이 아닌 응답");
    return data;
  }

  // CloudFront가 HTML로 502/504를 보내는 등 JSON이 아닌 오류는 SERVER_ERROR로 처리한다.
  const detail = data && data.detail;
  const errCode = detail && typeof detail.code === "string" ? detail.code : "SERVER_ERROR";
  if (code && PQ.REENTER_CODES.includes(errCode)) PQ.tokenStore.remove(code);
  throw new PQ.ApiError(errCode, res.status, detail && detail.message);
};

/* ---------- API 9개 ---------- */

function tripPath(code) {
  return "/api/trips/" + encodeURIComponent(code);
}

function itemPath(code, itemId) {
  return tripPath(code) + "/items/" + encodeURIComponent(itemId);
}

PQ.api = {
  // 1. 서버 상태 확인
  health() {
    return PQ.request("GET", "/api/health");
  },

  // 2. 여행 만들기. 응답의 code(대문자)로 토큰을 저장한다.
  async createTrip({ region, transport, duration, season, nickname }) {
    const res = await PQ.request("POST", "/api/trips", {
      body: { region, transport, duration, season, nickname },
    });
    PQ.tokenStore.set(res.code, res.token, { nickname: res.me.nickname, isHost: res.me.is_host });
    return res;
  },

  // 3. 코드로 참여. 사용자가 소문자로 입력해도 응답의 code로 저장한다.
  async joinTrip(code, nickname) {
    const res = await PQ.request("POST", tripPath(PQ.normalizeCode(code)) + "/members", {
      body: { nickname },
    });
    PQ.tokenStore.set(res.code, res.token, { nickname: res.me.nickname, isHost: res.me.is_host });
    return res;
  },

  // 4. 여행 전체 상태 조회 (5초 폴링)
  getTrip(code) {
    return PQ.request("GET", tripPath(code), { code });
  },

  // 5. 항목 추가
  addItem(code, { name, category }) {
    return PQ.request("POST", tripPath(code) + "/items", { code, body: { name, category } });
  },

  // 6. 항목 삭제 (주최자)
  deleteItem(code, itemId) {
    return PQ.request("DELETE", itemPath(code, itemId), { code });
  },

  // 7. 담당자 지정·해제 (해제는 null)
  setAssignee(code, itemId, assigneeId) {
    return PQ.request("PUT", itemPath(code, itemId) + "/assignee", {
      code,
      body: { assignee_id: assigneeId },
    });
  },

  // 8. 완료 체크·해제
  setDone(code, itemId, done) {
    return PQ.request("PUT", itemPath(code, itemId) + "/done", { code, body: { done } });
  },

  // 9. 여행 삭제 (주최자). 성공하면 저장한 토큰도 지운다.
  async deleteTrip(code) {
    await PQ.request("DELETE", tripPath(code), { code });
    PQ.tokenStore.remove(code);
  },
};
