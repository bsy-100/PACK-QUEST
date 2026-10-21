/* 가짜 서버. 주소에 ?mock=1 이 있을 때만 켜진다.
   B의 서버 없이 화면을 개발·확인하려고 API 명세(9개 API + 로그인 API 5개, 권한 규칙, 오류 코드)를 브라우저 안에서 흉내 낸다.
   실제 배포에서는 ?mock=1 을 붙이지 않으므로 아무 일도 하지 않는다.

   - 데이터는 localStorage의 packquest-mockdb 키에 저장한다(새로고침해도 유지).
   - 체험용 여행 PACK2345 가 미리 들어 있어 "코드로 참여"를 바로 해 볼 수 있다.
   - 가짜 참여자(봇)가 가끔 항목을 맡고 체크해서 5초 폴링으로 화면이 바뀌는 것을 볼 수 있다.
   - 초기화: 브라우저 콘솔에서 PQ.mock.reset() */

(function () {
  const params = new URLSearchParams(location.search);
  if (params.get("mock") !== "1") return;

  const DB_KEY = "packquest-mockdb";
  const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const DEMO_CODE = "PACK2345";
  const MAX_ITEMS = 200;
  const VALUES = {
    region: ["domestic", "overseas"],
    transport: ["plane", "car", "train"],
    duration: ["day", "short", "long"],
    season: ["spring_fall", "summer", "winter"],
    category: PQ.CATEGORY_ORDER,
  };

  /* ---------- 추천 규칙 (공용 준비물만) ----------
     서버는 나눠 맡는 공용 준비물만 추천하고, 각자 챙기는 개인 준비물은 화면(personal.js)이 만든다.
     B의 backend/app/data/recommend_rules.json(feature/api 4b7151d)을 그대로 옮긴 것이며,
     B가 JSON을 고치면 여기도 맞춰 준다. */

  const COMMON = [
    ["health", "상비약(소화제·진통제)"], ["health", "밴드·소독약"], ["health", "손 소독제"],
    ["electronics", "대용량 보조배터리"], ["electronics", "카메라·삼각대"], ["electronics", "블루투스 스피커"],
    ["etc", "물티슈"], ["etc", "휴지"], ["etc", "쓰레기봉투"], ["etc", "간식"],
  ];
  const SHORT_STAY = [
    ["documents", "숙소 예약 확인"],
    ["toiletries", "샴푸·린스"], ["toiletries", "바디워시"], ["toiletries", "치약"],
  ];
  const BY_CONDITION = {
    region: {
      domestic: [],
      overseas: [["documents", "환전(공용 경비)"], ["electronics", "멀티 어댑터"], ["electronics", "포켓 와이파이"]],
    },
    transport: {
      plane: [["etc", "기내 반입 규정 확인"]],
      car: [
        ["documents", "운전면허증(운전자)"], ["documents", "하이패스 카드"],
        ["electronics", "차량용 충전기"], ["electronics", "차량용 거치대"], ["health", "멀미약"],
      ],
      train: [["documents", "단체 승차권 예매 확인"]],
    },
    duration: {
      day: [],
      short: [...SHORT_STAY, ["etc", "보드게임"]],
      long: [
        ...SHORT_STAY,
        ["toiletries", "공용 세제"], ["toiletries", "손톱깎이"],
        ["electronics", "멀티탭"], ["health", "감기약"],
        ["etc", "세탁물 봉투"], ["etc", "보드게임"],
      ],
    },
    season: {
      spring_fall: [["etc", "돗자리"]],
      summer: [["health", "선크림"], ["health", "모기 기피제"], ["etc", "돗자리"]],
      winter: [["health", "핫팩 묶음"]],
    },
  };

  function recommend(trip) {
    const seen = new Set();
    const list = [];
    const add = ([category, name]) => {
      if (seen.has(name)) return;
      seen.add(name);
      list.push({ category, name });
    };
    COMMON.forEach(add);
    ["region", "transport", "duration", "season"].forEach((key) => BY_CONDITION[key][trip[key]].forEach(add));
    return list;
  }

  /* ---------- 저장소 ---------- */

  function emptyDb() {
    return { trips: {}, members: [], items: [], nextMemberId: 1, nextItemId: 1, users: [], sessions: [], nextUserId: 1 };
  }

  let db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch (e) { db = null; }
    if (!db) { db = emptyDb(); seedDemo(); save(); }
    // 로그인 기능이 생기기 전에 저장된 가짜 DB에는 이 필드가 없다.
    if (!db.users) { db.users = []; db.sessions = []; db.nextUserId = 1; }
  }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* 저장 못 해도 이번 화면에서는 동작 */ }
  }

  function randomBytes(n) {
    return Array.from(crypto.getRandomValues(new Uint8Array(n)));
  }
  function randomCode() {
    return randomBytes(8).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  }
  function randomToken() {
    return "mock-" + randomBytes(24).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function insertTrip(code, cond) {
    db.trips[code] = { code, ...cond, created_at: new Date().toISOString().slice(0, 19) + "Z" };
    recommend(cond).forEach(({ category, name }) => {
      db.items.push({ id: db.nextItemId++, trip_code: code, name, category, assignee_id: null, done: false, source: "recommended" });
    });
  }
  function insertMember(code, nickname, isHost, isBot, userId) {
    const member = {
      id: db.nextMemberId++, trip_code: code, nickname, token: randomToken(),
      is_host: isHost, is_bot: isBot, user_id: userId || null,
    };
    db.members.push(member);
    return member;
  }

  // 체험용 여행: 주최자와 참여자 모두 봇이다.
  function seedDemo() {
    insertTrip(DEMO_CODE, { region: "overseas", transport: "plane", duration: "short", season: "summer" });
    const host = insertMember(DEMO_CODE, "발표자", true, true);
    const bot = insertMember(DEMO_CODE, "민지", false, true);
    const items = db.items.filter((i) => i.trip_code === DEMO_CODE);
    items.slice(0, 3).forEach((i) => { i.assignee_id = host.id; i.done = true; });
    items.slice(3, 6).forEach((i) => { i.assignee_id = bot.id; });
  }

  /* ---------- 응답 도우미 ---------- */

  class Fail {
    constructor(status, code) { this.status = status; this.code = code; }
  }
  const fail = (status, code) => { throw new Fail(status, code); };

  function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  function itemOut(i) {
    return { item_id: i.id, name: i.name, category: i.category, assignee_id: i.assignee_id, done: i.done, source: i.source };
  }
  function memberOut(m) {
    return { member_id: m.id, nickname: m.nickname, is_host: m.is_host };
  }
  const rate = (done, total) => (total ? Math.round((done / total) * 100) : 0);

  function cleanText(value, max) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length < 1 || text.length > max) fail(422, "VALIDATION_ERROR");
    return text;
  }
  function oneOf(value, list) {
    if (!list.includes(value)) fail(422, "VALIDATION_ERROR");
    return value;
  }

  // 명세 "검사 순서": 토큰부터 확인하고, 여행이 있는지는 알려주지 않는다.
  function auth(headers, code) {
    const token = headers["X-Pack-Token"];
    if (!token) fail(401, "TOKEN_MISSING");
    const me = db.members.find((m) => m.token === token);
    if (!me || me.trip_code !== code) fail(401, "TOKEN_INVALID");
    return me;
  }
  // 로그인 토큰(X-Auth-Token) 검사. 명세: 없으면 AUTH_MISSING, 틀리거나 로그아웃했으면 AUTH_INVALID.
  function loginUser(headers) {
    const token = headers["X-Auth-Token"];
    if (!token) fail(401, "AUTH_MISSING");
    const session = db.sessions.find((s) => s.token === token);
    const user = session && db.users.find((u) => u.id === session.user_id);
    if (!user) fail(401, "AUTH_INVALID");
    return { user, token };
  }
  // 여행 만들기·참여에서는 로그인이 선택이다. 붙이지 않으면 null, 붙였는데 틀리면 AUTH_INVALID.
  function optionalUser(headers) {
    if (!headers["X-Auth-Token"]) return null;
    return loginUser(headers).user;
  }
  function userOut(u) {
    return { user_id: u.id, username: u.username, nickname: u.nickname };
  }
  function newSession(user) {
    const token = "mock-auth-" + randomBytes(24).map((b) => b.toString(16).padStart(2, "0")).join("");
    db.sessions.push({ token, user_id: user.id });
    return token;
  }
  function findItem(code, rawId) {
    const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN; // 숫자가 아니면 ITEM_NOT_FOUND
    const item = db.items.find((i) => i.id === id && i.trip_code === code);
    if (!item) fail(404, "ITEM_NOT_FOUND");
    return item;
  }

  /* ---------- 봇: 폴링할 때 가끔 움직인다 ---------- */

  function moveBots(code) {
    if (Math.random() > 0.35) return;
    const bots = db.members.filter((m) => m.trip_code === code && m.is_bot);
    if (!bots.length) return;
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const items = db.items.filter((i) => i.trip_code === code);
    const todo = items.find((i) => i.assignee_id === bot.id && !i.done);
    if (todo) { todo.done = true; return; }
    const free = items.find((i) => i.assignee_id === null);
    if (free) free.assignee_id = bot.id;
  }

  /* ---------- API 9개 ---------- */

  function getTrip(code, me) {
    moveBots(code);
    const members = db.members.filter((m) => m.trip_code === code);
    const items = db.items
      .filter((i) => i.trip_code === code)
      .sort((a, b) => PQ.CATEGORY_ORDER.indexOf(a.category) - PQ.CATEGORY_ORDER.indexOf(b.category) || a.id - b.id);
    const done = items.filter((i) => i.done).length;
    return {
      trip: { ...db.trips[code] },
      me: memberOut(me),
      members: members.map(memberOut),
      items: items.map(itemOut),
      progress: {
        total: items.length,
        done,
        unassigned: items.filter((i) => i.assignee_id === null).length,
        rate: rate(done, items.length),
        by_member: members.map((m) => {
          const mine = items.filter((i) => i.assignee_id === m.id);
          const mineDone = mine.filter((i) => i.done).length;
          return { member_id: m.id, assigned: mine.length, done: mineDone, rate: rate(mineDone, mine.length) };
        }),
        by_category: PQ.CATEGORY_ORDER.map((c) => {
          const inCat = items.filter((i) => i.category === c);
          return { category: c, total: inCat.length, done: inCat.filter((i) => i.done).length };
        }).filter((c) => c.total > 0),
      },
    };
  }

  // 내 여행 목록용 요약 진행률
  function tripSummary(code) {
    const items = db.items.filter((i) => i.trip_code === code);
    const done = items.filter((i) => i.done).length;
    return { total: items.length, done, rate: rate(done, items.length) };
  }

  /* ---------- 로그인 API 5개 (docs/API_AUTH.md) ---------- */

  function routeAuth(parts, method, headers, body) {
    const allow = (...methods) => { if (!methods.includes(method)) fail(405, "METHOD_NOT_ALLOWED"); };

    // A1. POST /api/auth/signup
    if (parts[0] === "auth" && parts[1] === "signup" && parts.length === 2) {
      allow("POST");
      const raw = typeof body.username === "string" ? body.username : "";
      if (!/^[A-Za-z0-9_]{4,20}$/.test(raw)) fail(422, "VALIDATION_ERROR");
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < PQ.LIMITS.passwordMin || password.length > PQ.LIMITS.passwordMax) fail(422, "VALIDATION_ERROR");
      const nickname = cleanText(body.nickname, PQ.LIMITS.nicknameMax);
      const username = raw.toLowerCase(); // 소문자로 저장한다
      if (db.users.some((u) => u.username === username)) fail(409, "USERNAME_TAKEN");
      const user = { id: db.nextUserId++, username, password, nickname }; // mock이라 비밀번호는 그대로 둔다
      db.users.push(user);
      return json(201, { token: newSession(user), user: userOut(user) });
    }

    // A2. POST /api/auth/login
    if (parts[0] === "auth" && parts[1] === "login" && parts.length === 2) {
      allow("POST");
      const username = typeof body.username === "string" ? body.username.toLowerCase() : "";
      const user = db.users.find((u) => u.username === username);
      // 아이디가 없는지 비밀번호가 틀렸는지 구분하지 않는다.
      if (!user || user.password !== body.password) fail(401, "LOGIN_FAILED");
      return json(200, { token: newSession(user), user: userOut(user) });
    }

    // A3. POST /api/auth/logout — 이 기기의 로그인 토큰만 지운다.
    if (parts[0] === "auth" && parts[1] === "logout" && parts.length === 2) {
      allow("POST");
      const { token } = loginUser(headers);
      db.sessions = db.sessions.filter((s) => s.token !== token);
      return new Response(null, { status: 204 });
    }

    // A4. GET /api/me
    if (parts[0] === "me" && parts.length === 1) {
      allow("GET");
      const { user } = loginUser(headers);
      const trips = db.members
        .filter((m) => m.user_id === user.id && db.trips[m.trip_code])
        .sort((a, b) => b.id - a.id) // 최근에 참여한 순서
        .map((m) => ({
          ...db.trips[m.trip_code],
          me: memberOut(m),
          progress: tripSummary(m.trip_code),
        }));
      return json(200, { user: userOut(user), trips });
    }

    // A5. POST /api/me/trips/{code}/token — 새 여행 토큰을 주고, 예전 기기의 토큰은 무효가 된다.
    if (parts[0] === "me" && parts[1] === "trips" && parts[3] === "token" && parts.length === 4) {
      allow("POST");
      const { user } = loginUser(headers);
      const code = PQ.normalizeCode(parts[2]);
      const member = db.members.find((m) => m.trip_code === code && m.user_id === user.id);
      if (!member || !db.trips[code]) fail(404, "TRIP_NOT_FOUND");
      member.token = randomToken();
      return json(200, { code, token: member.token, me: memberOut(member) });
    }

    fail(404, "NOT_FOUND");
  }

  function route(method, path, headers, body) {
    const parts = path.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const allow = (...methods) => { if (!methods.includes(method)) fail(405, "METHOD_NOT_ALLOWED"); };

    // 1. GET /api/health
    if (parts.length === 1 && parts[0] === "health") {
      allow("GET");
      return json(200, { status: "ok" });
    }
    if (parts[0] === "auth" || parts[0] === "me") return routeAuth(parts, method, headers, body);
    if (parts[0] !== "trips") fail(404, "NOT_FOUND");

    // 2. POST /api/trips
    if (parts.length === 1) {
      allow("POST");
      const user = optionalUser(headers); // 로그인 상태면 이 참여자를 계정에 연결한다
      const cond = {
        region: oneOf(body.region, VALUES.region),
        transport: oneOf(body.transport, VALUES.transport),
        duration: oneOf(body.duration, VALUES.duration),
        season: oneOf(body.season, VALUES.season),
      };
      const nickname = cleanText(body.nickname, PQ.LIMITS.nicknameMax);
      let code;
      do { code = randomCode(); } while (db.trips[code]); // 겹치면 다시 뽑는다
      insertTrip(code, cond);
      const host = insertMember(code, nickname, true, false, user && user.id);
      // 데모용 가짜 참여자 2명
      insertMember(code, "민지", false, true);
      insertMember(code, "현우", false, true);
      return json(201, { code, token: host.token, me: memberOut(host) });
    }

    const code = PQ.normalizeCode(parts[1]);

    // 3. POST /api/trips/{code}/members
    if (parts.length === 3 && parts[2] === "members") {
      allow("POST");
      const user = optionalUser(headers);
      if (!db.trips[code]) fail(404, "TRIP_NOT_FOUND"); // 형식이 틀린 코드도 여기서 걸린다
      const nickname = cleanText(body.nickname, PQ.LIMITS.nicknameMax);
      // 같은 계정이 같은 여행에 두 번 참여하면 다시 들어가기(A5)로 안내한다.
      if (user && db.members.some((m) => m.trip_code === code && m.user_id === user.id)) fail(409, "ALREADY_JOINED");
      const taken = db.members.some((m) => m.trip_code === code && m.nickname.toLowerCase() === nickname.toLowerCase());
      if (taken) fail(409, "NICKNAME_TAKEN");
      const member = insertMember(code, nickname, false, false, user && user.id);
      return json(201, { code, token: member.token, me: memberOut(member) });
    }

    // 4. GET /api/trips/{code}, 9. DELETE /api/trips/{code}
    if (parts.length === 2) {
      allow("GET", "DELETE");
      const me = auth(headers, code);
      if (method === "GET") return json(200, getTrip(code, me));
      if (!me.is_host) fail(403, "HOST_ONLY");
      delete db.trips[code];
      db.members = db.members.filter((m) => m.trip_code !== code);
      db.items = db.items.filter((i) => i.trip_code !== code);
      return new Response(null, { status: 204 });
    }

    if (parts[2] !== "items") fail(404, "NOT_FOUND");

    // 5. POST /api/trips/{code}/items
    if (parts.length === 3) {
      allow("POST");
      auth(headers, code);
      const name = cleanText(body.name, PQ.LIMITS.itemNameMax);
      const category = oneOf(body.category, VALUES.category);
      if (db.items.filter((i) => i.trip_code === code).length >= MAX_ITEMS) fail(422, "VALIDATION_ERROR");
      const item = { id: db.nextItemId++, trip_code: code, name, category, assignee_id: null, done: false, source: "custom" };
      db.items.push(item);
      return json(201, itemOut(item));
    }

    // 6. DELETE /api/trips/{code}/items/{item_id}
    if (parts.length === 4) {
      allow("DELETE");
      const me = auth(headers, code);
      if (!me.is_host) fail(403, "HOST_ONLY");
      const item = findItem(code, parts[3]);
      db.items = db.items.filter((i) => i !== item);
      return new Response(null, { status: 204 });
    }

    // 7. PUT .../assignee
    if (parts.length === 5 && parts[4] === "assignee") {
      allow("PUT");
      const me = auth(headers, code);
      const item = findItem(code, parts[3]);
      const target = body.assignee_id;
      if (target !== null && !Number.isInteger(target)) fail(422, "VALIDATION_ERROR");
      // 검사 순서는 B의 routers/items.py set_assignee와 같다.
      if (target !== null && !db.members.some((m) => m.id === target && m.trip_code === code)) fail(404, "MEMBER_NOT_FOUND");
      const current = item.assignee_id;
      if (target === current) return json(200, itemOut(item)); // 바뀌는 것이 없으면 done도 그대로
      if (!me.is_host) {
        if (target !== null && target !== me.id) fail(403, "NOT_ALLOWED");
        if (target === null && current !== me.id) fail(403, "NOT_ALLOWED");
        if (target === me.id && current !== null) fail(409, "ITEM_TAKEN");
      }
      item.assignee_id = target;
      item.done = false; // 담당자가 바뀌거나 해제되면 미완료로 되돌린다
      return json(200, itemOut(item));
    }

    // 8. PUT .../done
    if (parts.length === 5 && parts[4] === "done") {
      allow("PUT");
      const me = auth(headers, code);
      const item = findItem(code, parts[3]);
      if (typeof body.done !== "boolean") fail(422, "VALIDATION_ERROR");
      if (item.assignee_id === null) fail(409, "NO_ASSIGNEE");
      if (item.assignee_id !== me.id) fail(403, "NOT_YOUR_ITEM");
      item.done = body.done;
      return json(200, itemOut(item));
    }

    fail(404, "NOT_FOUND");
  }

  /* ---------- fetch 바꿔 끼우기 ---------- */

  PQ.fetchImpl = async function (url, init = {}) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200)); // 네트워크 지연 흉내
    load();
    const method = (init.method || "GET").toUpperCase();
    const path = new URL(url, location.href).pathname;
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
    try {
      const res = route(method, path, init.headers || {}, body || {});
      save();
      return res;
    } catch (e) {
      if (e instanceof Fail) {
        return json(e.status, { detail: { code: e.code, message: "(mock) " + e.code } });
      }
      console.error("[mock]", e);
      return json(500, { detail: { code: "SERVER_ERROR", message: "(mock) " + e } });
    }
  };

  PQ.mock = {
    enabled: true,
    demoCode: DEMO_CODE,
    reset() {
      try { localStorage.removeItem(DB_KEY); } catch (e) { /* 무시 */ }
      PQ.tokenStore.list().forEach((t) => PQ.tokenStore.remove(t.code));
      PQ.authStore.clear();
      load();
      console.info("[mock] 초기화했습니다. 새로고침하세요.");
    },
  };

  load();
  const badge = document.getElementById("mock-badge");
  if (badge) badge.hidden = false;
  console.info("[mock] 가짜 서버가 켜졌습니다. 체험용 코드:", DEMO_CODE);
})();
