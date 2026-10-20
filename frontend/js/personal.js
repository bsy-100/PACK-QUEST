/* 개인 준비물("내 짐").
   칫솔·여권처럼 모두가 각자 챙기는 준비물은 담당자를 나눌 필요가 없어서 서버에 두지 않는다.
   - 목록: 여행 조건(region, transport, duration, season)을 보고 화면이 만든다.
   - 체크·숨기기·직접 추가: 이 브라우저의 localStorage(packquest-personal:<공유 코드>)에만 저장한다.
   - 팀원에게 보이지 않고, 팀 진행률에도 들어가지 않는다.
   공용 준비물(나눠 맡는 것)은 B의 recommend_rules.json이 서버에서 만든다. */

window.PQ = window.PQ || {};

PQ.personal = (function () {
  const KEY_PREFIX = "packquest-personal:";

  // B의 recommend_rules.json(2026-10-19)에서 "각자 챙기는 것"으로 나눈 항목. [분류, 이름]
  const COMMON = [
    ["documents", "지갑"], ["documents", "신용카드·체크카드"], ["documents", "현금"],
    ["electronics", "휴대폰 충전기"], ["electronics", "보조배터리"], ["electronics", "이어폰"],
    ["health", "마스크"], ["etc", "우산"], ["etc", "텀블러"],
  ];
  const SHORT_STAY = [
    ["clothing", "갈아입을 옷"], ["clothing", "속옷"], ["clothing", "양말"], ["clothing", "잠옷"],
    ["toiletries", "칫솔"], ["toiletries", "스킨케어"], ["toiletries", "수건"],
  ];
  const BY_CONDITION = {
    region: {
      domestic: [["documents", "신분증"]],
      overseas: [["documents", "여권"], ["documents", "여행자 보험"], ["electronics", "유심·로밍"]],
    },
    transport: {
      plane: [["documents", "탑승권"], ["etc", "목베개"]],
      car: [],
      train: [],
    },
    duration: {
      day: [],
      short: SHORT_STAY,
      long: [...SHORT_STAY, ["clothing", "여벌 신발"], ["toiletries", "면도기"]],
    },
    season: {
      spring_fall: [["clothing", "가벼운 겉옷"]],
      summer: [["clothing", "모자"], ["etc", "선글라스"]],
      winter: [["clothing", "장갑"], ["clothing", "목도리"], ["clothing", "두꺼운 외투"]],
    },
  };

  // 여행 조건 → 추천 개인 준비물 [{key, name, category, custom:false}] (같은 이름은 한 번만)
  function recommend(trip) {
    const seen = new Set();
    const list = [];
    const groups = [COMMON].concat(["region", "transport", "duration", "season"]
      .map((k) => (BY_CONDITION[k] && BY_CONDITION[k][trip[k]]) || []));
    groups.forEach((group) => group.forEach(([category, name]) => {
      if (seen.has(name)) return;
      seen.add(name);
      list.push({ key: "rec:" + name, name, category, custom: false });
    }));
    return list;
  }

  /* ---------- 저장 ---------- */

  function empty() {
    return { checked: [], hidden: [], custom: [] };
  }

  function load(code) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_PREFIX + code));
      if (saved && Array.isArray(saved.checked) && Array.isArray(saved.hidden) && Array.isArray(saved.custom)) return saved;
    } catch (e) { /* 저장소가 막혔거나 값이 깨졌으면 새로 시작 */ }
    return empty();
  }

  function save(code, data) {
    try { localStorage.setItem(KEY_PREFIX + code, JSON.stringify(data)); } catch (e) { /* 이번 화면에서만 유지 */ }
  }

  function update(code, change) {
    const data = load(code);
    change(data);
    save(code, data);
  }

  /* ---------- 공개 함수 ---------- */

  return {
    // 화면에 보여줄 목록과 진행률
    view(code, trip) {
      const data = load(code);
      const checked = new Set(data.checked);
      const hidden = new Set(data.hidden);
      const items = recommend(trip)
        .filter((i) => !hidden.has(i.key))
        .concat(data.custom.map((c) => ({ key: c.key, name: c.name, category: c.category, custom: true })))
        .map((i) => ({ ...i, done: checked.has(i.key) }));
      const done = items.filter((i) => i.done).length;
      return {
        items,
        hiddenCount: hidden.size,
        total: items.length,
        done,
        rate: items.length ? Math.round((done / items.length) * 100) : 0,
      };
    },

    setDone(code, key, done) {
      update(code, (d) => {
        d.checked = d.checked.filter((k) => k !== key);
        if (done) d.checked.push(key);
      });
    },

    // 추천 항목은 숨기고, 직접 추가한 항목은 지운다.
    remove(code, key) {
      update(code, (d) => {
        d.checked = d.checked.filter((k) => k !== key);
        if (key.startsWith("rec:")) {
          if (!d.hidden.includes(key)) d.hidden.push(key);
        } else {
          d.custom = d.custom.filter((c) => c.key !== key);
        }
      });
    },

    restoreHidden(code) {
      update(code, (d) => { d.hidden = []; });
    },

    add(code, name, category) {
      update(code, (d) => {
        d.custom.push({ key: "custom:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, category });
      });
    },

    // 여행을 떠날 때(토큰 삭제) 함께 지운다.
    clear(code) {
      try { localStorage.removeItem(KEY_PREFIX + code); } catch (e) { /* 무시 */ }
    },
  };
})();
