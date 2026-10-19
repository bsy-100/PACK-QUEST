/* 가짜 서버. 주소에 ?mock=1 이 있을 때만 켜진다.
   B의 서버 없이 화면을 개발·확인하려고 API 명세(9개 API, 권한 규칙, 오류 코드)를 브라우저 안에서 흉내 낸다.
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

  /* ---------- 추천 규칙 (실제 목록은 B의 서버 JSON이 기준이며, 여기는 화면 확인용 축약본) ---------- */

  const COMMON = [
    ["documents", "신분증"], ["documents", "지갑·카드"],
    ["clothing", "속옷"], ["clothing", "양말"], ["clothing", "잠옷"],
    ["toiletries", "칫솔·치약"], ["toiletries", "세면도구"], ["toiletries", "수건"],
    ["electronics", "휴대폰 충전기"], ["electronics", "보조배터리"], ["electronics", "이어폰"],
    ["health", "상비약"], ["health", "밴드"], ["health", "마스크"],
    ["etc", "물티슈"], ["etc", "비닐봉지"], ["etc", "우산"],
  ];
  const BY_CONDITION = {
    region: {
      domestic: [],
      overseas: [["documents", "여권"], ["documents", "환전"], ["electronics", "유심·로밍"], ["electronics", "멀티 어댑터"]],
    },
    transport: {
      plane: [["documents", "탑승권"], ["etc", "기내 반입 규정 확인"]],
      car: [["documents", "운전면허증"], ["electronics", "차량용 충전기"], ["health", "멀미약"]],
      train: [["documents", "승차권"]],
    },
    duration: {
      day: [],
      short: [["clothing", "갈아입을 옷"]],
      long: [["clothing", "갈아입을 옷"], ["clothing", "여벌 신발"], ["toiletries", "화장품"], ["health", "개인 복용약"]],
    },
    season: {
      spring_fall: [["clothing", "얇은 겉옷"]],
      summer: [["health", "선크림"], ["clothing", "모자"]],
      winter: [["etc", "핫팩"], ["clothing", "장갑"]],
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
    return { trips: {}, members: [], items: [], nextMemberId: 1, nextItemId: 1 };
  }

  let db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch (e) { db = null; }
    if (!db) { db = emptyDb(); seedDemo(); save(); }
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
  function insertMember(code, nickname, isHost, isBot) {
    const member = { id: db.nextMemberId++, trip_code: code, nickname, token: randomToken(), is_host: isHost, is_bot: isBot };
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

  function route(method, path, headers, body) {
    const parts = path.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const allow = (...methods) => { if (!methods.includes(method)) fail(405, "METHOD_NOT_ALLOWED"); };

    // 1. GET /api/health
    if (parts.length === 1 && parts[0] === "health") {
      allow("GET");
      return json(200, { status: "ok" });
    }
    if (parts[0] !== "trips") fail(404, "NOT_FOUND");

    // 2. POST /api/trips
    if (parts.length === 1) {
      allow("POST");
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
      const host = insertMember(code, nickname, true, false);
      // 데모용 가짜 참여자 2명
      insertMember(code, "민지", false, true);
      insertMember(code, "현우", false, true);
      return json(201, { code, token: host.token, me: memberOut(host) });
    }

    const code = PQ.normalizeCode(parts[1]);

    // 3. POST /api/trips/{code}/members
    if (parts.length === 3 && parts[2] === "members") {
      allow("POST");
      if (!db.trips[code]) fail(404, "TRIP_NOT_FOUND"); // 형식이 틀린 코드도 여기서 걸린다
      const nickname = cleanText(body.nickname, PQ.LIMITS.nicknameMax);
      const taken = db.members.some((m) => m.trip_code === code && m.nickname.toLowerCase() === nickname.toLowerCase());
      if (taken) fail(409, "NICKNAME_TAKEN");
      const member = insertMember(code, nickname, false, false);
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
      if (!me.is_host) {
        if (target === null) {
          if (item.assignee_id !== null && item.assignee_id !== me.id) fail(403, "NOT_ALLOWED");
        } else if (target !== me.id) {
          fail(403, "NOT_ALLOWED");
        } else if (item.assignee_id !== null && item.assignee_id !== me.id) {
          fail(409, "ITEM_TAKEN");
        }
      }
      if (target !== null && !db.members.some((m) => m.id === target && m.trip_code === code)) fail(404, "MEMBER_NOT_FOUND");
      if (item.assignee_id !== target) {
        item.assignee_id = target;
        item.done = false; // 담당자가 바뀌거나 해제되면 미완료로 되돌린다
      }
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
      load();
      console.info("[mock] 초기화했습니다. 새로고침하세요.");
    },
  };

  load();
  const badge = document.getElementById("mock-badge");
  if (badge) badge.hidden = false;
  console.info("[mock] 가짜 서버가 켜졌습니다. 체험용 코드:", DEMO_CODE);
})();
