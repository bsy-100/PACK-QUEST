/* 화면 전환, 짐 목록 그리기, 버튼 동작, 5초 폴링.
   모든 화면은 index.html 한 파일 안에서 보여주고 숨긴다(다른 경로로 이동하지 않는다).
   사용자 입력은 textContent로만 넣는다(innerHTML 금지). */

(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    code: null,        // 지금 보고 있는 여행 코드
    data: null,        // 마지막 여행 조회(4번) 응답
    pollTimer: null,
    loading: false,    // 조회 요청이 진행 중인지
    busy: false,       // 버튼 동작이 진행 중인지
    retry: null,       // 오류 안내의 "다시 시도"가 할 일
    tab: "shared",     // "shared"(같이 챙길 짐) 또는 "personal"(내 가방)
    prevShared: null,  // 직전에 그린 같이 챙길 짐 상태 {rate, complete, done} — 축하·애니메이션용
    prevPersonal: null,
  };

  /* ---------- 공통 도우미 ---------- */

  function setUrlCode(code) {
    const params = new URLSearchParams(location.search);
    if (code) params.set("code", code);
    else params.delete("code");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : ""));
  }

  let toastTimer = null;
  function toast(message, party) {
    const node = $("toast");
    node.textContent = message;
    node.classList.toggle("toast--party", !!party);
    node.hidden = false;
    // 같은 알림이 연달아 와도 등장 애니메이션이 다시 돌게 한다.
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, party ? 3200 : 2500);
  }

  function celebrate(message) {
    toast(message, true);
  }

  function showBanner(message, retry) {
    $("error-message").textContent = message;
    state.retry = retry || null;
    $("error-retry").hidden = !retry;
    $("error-banner").hidden = false;
  }
  function hideBanner() {
    $("error-banner").hidden = true;
    state.retry = null;
  }

  function showFormError(id, message) {
    const node = $(id);
    node.textContent = message || "";
    node.hidden = !message;
  }

  function label(group, value) {
    return (PQ.LABELS[group] && PQ.LABELS[group][value]) || value;
  }

  function icon(group, value) {
    return (PQ.ICONS[group] && PQ.ICONS[group][value]) || "";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // 애니메이션 클래스를 다시 붙여 처음부터 재생한다.
  function replay(node, className) {
    node.classList.remove(className);
    void node.getBoundingClientRect();
    node.classList.add(className);
  }

  // 분류별 개수 → Map(category → {total, done})
  function categoryStats(items) {
    const stats = new Map();
    items.forEach((i) => {
      const s = stats.get(i.category) || { total: 0, done: 0 };
      s.total += 1;
      if (i.done) s.done += 1;
      stats.set(i.category, s);
    });
    return stats;
  }

  function completeCategories(stats) {
    return new Set([...stats].filter(([, s]) => s.total > 0 && s.done === s.total).map(([c]) => c));
  }

  /* ---------- 화면 전환 ---------- */

  const VIEWS = ["home", "create", "join", "trip"];

  function showView(name) {
    VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
    if (name !== "trip") stopPolling();
    hideBanner();
    window.scrollTo(0, 0);
  }

  function goHome() {
    state.code = null;
    state.data = null;
    setUrlCode(null);
    renderMyTrips();
    showView("home");
  }

  function goCreate() {
    $("create-form").reset();
    showFormError("create-error", "");
    showView("create");
  }

  function goJoin(prefillCode) {
    $("join-form").reset();
    $("join-form").elements.code.value = prefillCode || "";
    showFormError("join-error", "");
    showView("join");
    (prefillCode ? $("join-form").elements.nickname : $("join-form").elements.code).focus();
  }

  /* ---------- 시작 화면: 내 여행 티켓 ---------- */

  function renderMyTrips() {
    const trips = PQ.tokenStore.list();
    const list = $("my-trips");
    list.replaceChildren();
    trips.forEach((t) => {
      const li = el("li");
      const btn = el("button", "trip-ticket");
      btn.type = "button";

      const left = el("span", "trip-ticket__main");
      left.append(el("strong", "trip-ticket__code", t.code));
      left.append(el("span", "trip-ticket__who",
        `${t.nickname || "닉네임 없음"}${t.isHost ? " · 👑 주최자" : ""}`));

      btn.append(left, el("span", "trip-ticket__go", "이어서 짐싸기 →"));
      btn.addEventListener("click", () => openTrip(t.code));
      li.append(btn);
      list.append(li);
    });
    $("my-trips-card").hidden = trips.length === 0;
  }

  /* ---------- 여행 만들기 ---------- */

  async function onCreate(event) {
    event.preventDefault();
    const form = event.target;
    const values = {};
    for (const key of ["region", "transport", "duration", "season"]) {
      const picked = form.querySelector(`input[name="${key}"]:checked`);
      if (!picked) return showFormError("create-error", "어디로, 무엇을 타고, 얼마나, 어느 계절에 가는지 모두 골라 주세요.");
      values[key] = picked.value;
    }
    values.nickname = form.elements.nickname.value.trim();
    if (!values.nickname || values.nickname.length > PQ.LIMITS.nicknameMax) {
      return showFormError("create-error", `닉네임은 1~${PQ.LIMITS.nicknameMax}자로 입력해 주세요.`);
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    showFormError("create-error", "");
    try {
      const res = await PQ.api.createTrip(values);
      toast("새 여행이 시작됐어요! 초대 코드를 친구들에게 보내 주세요.");
      openTrip(res.code);
    } catch (err) {
      showFormError("create-error", err.message);
    } finally {
      submit.disabled = false;
    }
  }

  /* ---------- 코드로 참여 ---------- */

  async function onJoin(event) {
    event.preventDefault();
    const form = event.target;
    const code = PQ.normalizeCode(form.elements.code.value);
    const nickname = form.elements.nickname.value.trim();
    if (code.length !== PQ.LIMITS.codeLength) return showFormError("join-error", PQ.errorMessage("TRIP_NOT_FOUND"));
    if (!nickname || nickname.length > PQ.LIMITS.nicknameMax) {
      return showFormError("join-error", `닉네임은 1~${PQ.LIMITS.nicknameMax}자로 입력해 주세요.`);
    }

    // 이 브라우저에 이미 그 여행의 토큰이 있으면 새로 참여하지 않고 연다.
    if (PQ.tokenStore.get(code)) return openTrip(code);

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    showFormError("join-error", "");
    try {
      const res = await PQ.api.joinTrip(code, nickname);
      toast("탑승 완료! 함께 짐을 챙겨 봐요.");
      openTrip(res.code);
    } catch (err) {
      showFormError("join-error", err.message);
    } finally {
      submit.disabled = false;
    }
  }

  /* ---------- 짐싸기 화면: 불러오기와 폴링 ---------- */

  function openTrip(code) {
    if (!PQ.tokenStore.get(code)) return goJoin(code);
    state.code = code;
    state.data = null;
    state.prevShared = null;
    state.prevPersonal = null;
    setUrlCode(code);
    $("item-groups").replaceChildren(el("p", "card loading", "짐 목록을 불러오는 중이에요…"));
    $("personal-groups").replaceChildren();
    $("badge-list").replaceChildren();
    $("member-list").replaceChildren();
    setTab("shared");
    $("share-code").textContent = code;
    $("trip-summary").textContent = "여행 정보를 불러오는 중…";
    renderTicket();
    showView("trip");
    load();
    startPolling();
  }

  async function load() {
    if (!state.code || state.loading) return;
    const code = state.code;
    state.loading = true;
    try {
      const data = await PQ.api.getTrip(code);
      if (code !== state.code) return; // 그사이 다른 화면으로 이동했다
      state.data = data;
      render();
      if (!$("error-banner").hidden && state.retry === load) hideBanner();
    } catch (err) {
      handleError(err, load);
    } finally {
      state.loading = false;
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (!document.hidden) load();
    }, PQ.POLL_INTERVAL_MS);
  }
  function stopPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // 명세: TOKEN_MISSING / TOKEN_INVALID / TRIP_NOT_FOUND는 입장 화면으로, 나머지는 안내 + 재시도.
  function handleError(err, retry) {
    if (PQ.REENTER_CODES.includes(err.code) && state.code) {
      const code = state.code; // api.js가 저장한 토큰은 이미 지웠다
      stopPolling();
      state.code = null; // 이후 load()가 토큰 없이 다시 부르지 않게
      state.data = null;
      toast("여행이 삭제됐거나 입장 정보가 없어요. " + err.message);
      goJoin(code);
      return;
    }
    if (err.code === "NOT_FOUND" || err.code === "METHOD_NOT_ALLOWED") {
      console.error("[PACK QUEST] 화면이 API를 잘못 불렀습니다:", err.code, err.serverMessage);
    }
    showBanner(err.message, retry);
  }

  /* ---------- 여행 티켓 ---------- */

  // 여행지 이름이 없으므로 "국내 여행 / 해외 여행"과 이동수단 아이콘으로 보여준다.
  function renderTicket() {
    const trip = state.data && state.data.trip;
    $("ticket-dest").textContent = trip ? `${label("region", trip.region)} 여행` : "여행지";
    $("ticket-transport").textContent = trip ? icon("transport", trip.transport) : "✈️";
  }

  /* ---------- 짐싸기 화면: 그리기 ---------- */

  function packStage(rate, total) {
    if (total === 0) return "챙길 물건을 추가하면 캐리어가 채워져요.";
    if (rate === 100) return "짐싸기 완료! 이제 떠나기만 하면 돼요 🎉";
    if (rate >= 80) return "출발 준비 거의 끝! 조금만 더 힘내요";
    if (rate >= 50) return "벌써 절반 넘게 챙겼어요";
    if (rate > 0) return "짐싸기 시작! 하나씩 채워 가요";
    return "캐리어가 아직 텅 비었어요. 첫 짐을 넣어 볼까요?";
  }

  // 직전 상태와 비교해 새로 달성한 것 하나만 축하한다(처음 그릴 때는 축하하지 않는다).
  function sharedMilestone(prev, rate, total, complete) {
    if (!prev || total === 0) return;
    if (rate === 100 && prev.rate < 100) return celebrate("🎉 짐싸기 완료! 이제 떠나기만 하면 돼요");
    const fresh = [...complete].find((c) => !prev.complete.has(c));
    if (fresh) return celebrate(`${icon("category", fresh)} ${label("category", fresh)} 준비 완료!`);
    if (rate >= 80 && prev.rate < 80) return celebrate("🚀 출발 준비 80% 완료!");
    if (rate >= 50 && prev.rate < 50) return celebrate("✨ 절반 넘게 챙겼어요!");
  }

  function render() {
    const { trip, me, members, items, progress } = state.data;
    const isHost = me.is_host;
    const nameOf = new Map(members.map((m) => [m.member_id, m.nickname]));

    // 여행 티켓과 초대 코드
    const summary = $("trip-summary");
    summary.replaceChildren();
    ["region", "duration", "season"].forEach((key) => {
      summary.append(el("span", "chip", `${icon(key, trip[key])} ${label(key, trip[key])}`));
    });
    $("share-code").textContent = trip.code;
    renderTicket();

    const meLine = $("me-line");
    meLine.replaceChildren(el("span", "", `🙋 ${me.nickname}님, 짐 쌀 준비 됐나요?`));
    if (isHost) meLine.append(el("span", "chip chip--host", "👑 주최자"));
    $("trip-danger").hidden = !isHost;

    // 캐리어와 짐싸기 진행률
    const prev = state.prevShared;
    const stats = categoryStats(items);
    const complete = completeCategories(stats);
    const suitcase = $("suitcase");
    suitcase.style.setProperty("--fill", progress.rate / 100);
    if (prev && progress.rate > prev.rate) replay(suitcase, "is-bump");
    $("progress-rate").textContent = progress.rate + "%";
    $("pack-stage").textContent = packStage(progress.rate, progress.total);
    $("progress-fill").style.width = progress.rate + "%";
    $("progress-bar").setAttribute("aria-valuenow", progress.rate);
    $("progress-sub").textContent =
      `${progress.done}/${progress.total}개 챙김 · 아직 맡은 사람 없는 짐 ${progress.unassigned}개`;
    renderBadges(stats, complete, prev);
    sharedMilestone(prev, progress.rate, progress.total, complete);

    // 새로 캐리어에 들어간 항목(애니메이션용)
    const doneIds = new Set(items.filter((i) => i.done).map((i) => i.item_id));
    const justPacked = new Set(prev ? [...doneIds].filter((id) => !prev.done.has(id)) : []);
    state.prevShared = { rate: progress.rate, complete, done: doneIds };

    renderMembers(members, me, progress);

    $("shared-count").textContent = `${progress.done}/${progress.total}`;
    renderPersonal();

    // 담당자 선택 목록을 펼친 채 고르는 중이면 목록을 다시 그리지 않는다(폴링이 선택을 닫지 않게).
    const active = document.activeElement;
    if (active && active.tagName === "SELECT" && $("item-groups").contains(active)) return;
    renderItems(items, me, isHost, members, nameOf, stats, justPacked);
  }

  // 분류별 배지: 다 챙긴 분류는 배지를 얻는다.
  function renderBadges(stats, complete, prev) {
    const list = $("badge-list");
    list.replaceChildren();
    PQ.CATEGORY_ORDER.forEach((category) => {
      const s = stats.get(category);
      if (!s) return;
      const earned = complete.has(category);
      const li = el("li", "badge" + (earned ? " is-earned" : ""));
      li.dataset.category = category;
      li.append(el("span", "badge__icon", icon("category", category)));
      li.append(el("span", "badge__label", label("category", category)));
      li.append(el("span", "badge__count", earned ? "완료" : `${s.done}/${s.total}`));
      li.title = earned ? `${label("category", category)} 준비 완료` : `${label("category", category)} ${s.done}/${s.total}`;
      if (earned && prev && !prev.complete.has(category)) li.classList.add("is-new");
      list.append(li);
    });
  }

  function renderMembers(members, me, progress) {
    const byMember = new Map(progress.by_member.map((b) => [b.member_id, b]));
    const memberList = $("member-list");
    memberList.replaceChildren();
    members.forEach((m, index) => {
      const stat = byMember.get(m.member_id) || { assigned: 0, done: 0, rate: 0 };
      const isMe = m.member_id === me.member_id;
      const li = el("li", "member" + (isMe ? " is-me" : ""));
      const avatar = el("span", `avatar avatar--${index % 4}`, Array.from(m.nickname)[0] || "?");
      avatar.setAttribute("aria-hidden", "true");

      const info = el("div", "member__info");
      const name = el("span", "member__name", m.nickname);
      if (m.is_host) name.append(el("span", "member__tag", "👑"));
      if (isMe) name.append(el("span", "member__tag member__tag--me", "나"));
      const count = el("span", "member__count",
        stat.assigned ? `${stat.done}/${stat.assigned}개 · ${stat.rate}%` : "아직 맡은 짐 없음");
      const bar = el("div", "bar bar--mini");
      const fill = el("span", "bar__fill");
      fill.style.width = stat.rate + "%";
      bar.append(fill);
      info.append(name, count, bar);

      li.append(avatar, info);
      memberList.append(li);
    });
  }

  // 분류 카드 하나(제목, 개수, 작은 진행 막대, 완료 도장)
  function groupCard(category, done, total) {
    const complete = total > 0 && done === total;
    const section = el("section", "card group" + (complete ? " is-complete" : ""));
    section.dataset.category = category;

    const head = el("div", "group__head");
    head.append(el("span", "group__icon", icon("category", category)));
    const title = el("h2", "group__title", label("category", category));
    head.append(title);
    head.append(el("span", "group__count", `${done}/${total}`));
    if (complete) head.append(el("span", "group__stamp", "준비 완료!"));

    const bar = el("div", "bar bar--mini");
    const fill = el("span", "bar__fill");
    fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
    bar.append(fill);

    section.append(head, bar);
    return section;
  }

  function renderItems(items, me, isHost, members, nameOf, stats, justPacked) {
    const groups = $("item-groups");
    const template = $("item-template");
    groups.replaceChildren();

    if (items.length === 0) {
      groups.append(el("p", "card empty", "🧳 아직 챙길 물건이 없어요. 아래에서 첫 물건을 추가해 보세요."));
      return;
    }

    // 항목이 있는 분류만 보여준다(예: 당일 여행은 의류·세면이 비어 있을 수 있다).
    PQ.CATEGORY_ORDER.forEach((category) => {
      const s = stats.get(category);
      if (!s) return;
      const inCategory = items.filter((i) => i.category === category);
      const section = groupCard(category, s.done, s.total);
      const list = el("ul", "items");

      inCategory.forEach((item) => {
        const node = template.content.firstElementChild.cloneNode(true);
        const mine = item.assignee_id === me.member_id;
        node.dataset.itemId = item.item_id;
        node.classList.toggle("is-done", item.done);
        node.classList.toggle("is-mine", mine);
        node.classList.toggle("just-packed", justPacked.has(item.item_id));

        node.querySelector(".item__name").textContent = item.name;

        const check = node.querySelector(".item__done");
        check.checked = item.done;
        check.disabled = !mine; // 완료 체크는 담당자만
        check.title = mine ? "" : item.assignee_id === null ? "먼저 \"내가 챙길게\"를 눌러 주세요." : "맡은 사람만 체크할 수 있어요.";
        check.setAttribute("aria-label", `${item.name} ${item.done ? "챙김" : "챙기기"}`);

        const assigneeText = node.querySelector(".item__assignee");
        assigneeText.textContent =
          item.assignee_id === null ? "맡은 사람 없음" : mine ? "🙋 내가 챙겨요" : `🙋 ${nameOf.get(item.assignee_id) || "알 수 없음"}`;
        assigneeText.classList.toggle("is-empty", item.assignee_id === null);
        assigneeText.hidden = isHost; // 주최자는 담당자 선택 상자에 이름이 보인다

        node.querySelector(".item__claim").hidden = item.assignee_id !== null;
        node.querySelector(".item__release").hidden = !mine;

        const assign = node.querySelector(".item__assign");
        const del = node.querySelector(".item__delete");
        assign.hidden = !isHost;
        del.hidden = !isHost;
        if (isHost) {
          const none = el("option", "", "맡은 사람 없음");
          none.value = "";
          assign.append(none);
          members.forEach((m) => {
            const opt = el("option", "", `🙋 ${m.nickname}`);
            opt.value = String(m.member_id);
            assign.append(opt);
          });
          assign.value = item.assignee_id === null ? "" : String(item.assignee_id);
        }

        list.append(node);
      });

      section.append(list);
      groups.append(section);
    });
  }

  /* ---------- 내 가방 (서버를 거치지 않는다) ---------- */

  function setTab(tab) {
    state.tab = tab;
    ["shared", "personal"].forEach((name) => {
      $("tab-" + name).setAttribute("aria-selected", String(name === tab));
      $("panel-" + name).hidden = name !== tab;
    });
  }

  function personalMilestone(prev, rate, total, complete) {
    if (!prev || total === 0) return;
    if (rate === 100 && prev.rate < 100) return celebrate("🎒 내 가방 준비 끝! 잊은 건 없겠죠?");
    const fresh = [...complete].find((c) => !prev.complete.has(c));
    if (fresh) celebrate(`🎒 내 가방 · ${label("category", fresh)} 챙김 완료!`);
  }

  function renderPersonal() {
    if (!state.code || !state.data) return;
    const view = PQ.personal.view(state.code, state.data.trip);
    const stats = categoryStats(view.items);
    const complete = completeCategories(stats);
    const prev = state.prevPersonal;
    const doneKeys = new Set(view.items.filter((i) => i.done).map((i) => i.key));
    const justPacked = new Set(prev ? [...doneKeys].filter((k) => !prev.done.has(k)) : []);
    personalMilestone(prev, view.rate, view.total, complete);
    state.prevPersonal = { rate: view.rate, complete, done: doneKeys };

    $("personal-count").textContent = `${view.done}/${view.total}`;
    $("personal-rate").textContent = view.rate + "%";
    $("personal-fill").style.width = view.rate + "%";
    $("personal-bar").setAttribute("aria-valuenow", view.rate);
    $("personal-sub").textContent = `${view.done}/${view.total}개 챙김 · 이 기기에만 저장돼요`;

    const restore = $("personal-restore");
    restore.hidden = view.hiddenCount === 0;
    restore.textContent = `숨긴 추천 물건 다시 보기 (${view.hiddenCount})`;

    const groups = $("personal-groups");
    const template = $("personal-template");
    groups.replaceChildren();
    if (view.items.length === 0) {
      groups.append(el("p", "card empty", "🎒 내 가방이 비어 있어요. 아래에서 직접 추가해 보세요."));
      return;
    }

    PQ.CATEGORY_ORDER.forEach((category) => {
      const s = stats.get(category);
      if (!s) return;
      const inCategory = view.items.filter((i) => i.category === category);
      const section = groupCard(category, s.done, s.total);
      const list = el("ul", "items");

      inCategory.forEach((item) => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.dataset.key = item.key;
        node.classList.toggle("is-done", item.done);
        node.classList.toggle("just-packed", justPacked.has(item.key));
        node.querySelector(".item__name").textContent = item.name;
        const check = node.querySelector(".item__done");
        check.checked = item.done;
        check.setAttribute("aria-label", `${item.name} ${item.done ? "챙김" : "챙기기"}`);
        node.querySelector(".item__tag").hidden = !item.custom;
        const remove = node.querySelector(".personal__remove");
        remove.textContent = item.custom ? "빼기" : "숨기기";
        remove.setAttribute("aria-label", `${item.name} ${item.custom ? "빼기" : "숨기기"}`);
        list.append(node);
      });

      section.append(list);
      groups.append(section);
    });
  }

  function onPersonalEvent(event) {
    const row = event.target.closest(".item");
    if (!row || !state.code) return;
    const key = row.dataset.key;
    if (event.type === "change" && event.target.classList.contains("item__done")) {
      PQ.personal.setDone(state.code, key, event.target.checked);
      renderPersonal();
    } else if (event.type === "click" && event.target.closest(".personal__remove")) {
      PQ.personal.remove(state.code, key);
      renderPersonal();
    }
  }

  function onPersonalAdd(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    if (!name || name.length > PQ.LIMITS.itemNameMax) {
      return showFormError("personal-add-error", `물건 이름은 1~${PQ.LIMITS.itemNameMax}자로 입력해 주세요.`);
    }
    showFormError("personal-add-error", "");
    PQ.personal.add(state.code, name, form.elements.category.value);
    form.elements.name.value = "";
    renderPersonal();
    toast(`"${name}"을(를) 내 가방 목록에 담았어요.`);
  }

  /* ---------- 짐싸기 화면: 버튼 동작 ---------- */

  async function runAction(action) {
    if (state.busy || !state.code) return;
    state.busy = true;
    try {
      await action(state.code);
      hideBanner();
    } catch (err) {
      handleError(err, () => runAction(action));
    } finally {
      state.busy = false;
    }
    if (state.code) await load(); // 성공이든 실패든 서버 상태로 다시 맞춘다
  }

  function onItemEvent(event) {
    const row = event.target.closest(".item");
    if (!row || !state.data) return;
    const itemId = Number(row.dataset.itemId);
    const meId = state.data.me.member_id;
    const target = event.target;

    if (event.type === "change" && target.classList.contains("item__done")) {
      const done = target.checked;
      row.classList.toggle("is-done", done); // 서버 응답 전에 바로 반응해 보이게
      runAction((code) => PQ.api.setDone(code, itemId, done));
    } else if (event.type === "change" && target.classList.contains("item__assign")) {
      const value = target.value === "" ? null : Number(target.value);
      target.blur();
      runAction((code) => PQ.api.setAssignee(code, itemId, value));
    } else if (event.type === "click" && target.closest(".item__claim")) {
      runAction((code) => PQ.api.setAssignee(code, itemId, meId));
    } else if (event.type === "click" && target.closest(".item__release")) {
      runAction((code) => PQ.api.setAssignee(code, itemId, null));
    } else if (event.type === "click" && target.closest(".item__delete")) {
      const name = row.querySelector(".item__name").textContent;
      if (confirm(`"${name}"을(를) 목록에서 뺄까요?`)) {
        runAction((code) => PQ.api.deleteItem(code, itemId));
      }
    }
  }

  async function onAddItem(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    const category = form.elements.category.value;
    if (!name || name.length > PQ.LIMITS.itemNameMax) {
      return showFormError("add-item-error", `물건 이름은 1~${PQ.LIMITS.itemNameMax}자로 입력해 주세요.`);
    }
    showFormError("add-item-error", "");
    await runAction(async (code) => {
      await PQ.api.addItem(code, { name, category });
      form.elements.name.value = "";
      toast(`"${name}"을(를) 챙길 목록에 담았어요.`);
    });
  }

  async function onDeleteTrip() {
    if (!state.code) return;
    if (!confirm("여행을 삭제하면 크루와 짐 목록이 모두 사라지고 되돌릴 수 없어요. 삭제할까요?")) return;
    const code = state.code;
    try {
      await PQ.api.deleteTrip(code);
      toast("여행을 삭제했어요.");
      goHome();
    } catch (err) {
      handleError(err, onDeleteTrip);
    }
  }

  async function onCopyCode() {
    const code = $("share-code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      toast("초대 코드를 복사했어요. 친구에게 보내 주세요!");
    } catch (e) {
      // http 주소 등 클립보드를 못 쓰는 환경: 코드를 선택해 두어 직접 복사하게 한다.
      const range = document.createRange();
      range.selectNodeContents($("share-code"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      toast("코드를 선택했어요. 복사해 주세요.");
    }
  }

  /* ---------- 시작 ---------- */

  function init() {
    // 물건 추가의 분류 선택지 (같이 챙길 짐, 내 가방)
    ["add-item-category", "personal-add-category"].forEach((id) => {
      const select = $(id);
      PQ.CATEGORY_ORDER.forEach((c) => {
        const opt = el("option", "", `${icon("category", c)} ${label("category", c)}`);
        opt.value = c;
        select.append(opt);
      });
      select.value = "etc";
    });

    $("tab-shared").addEventListener("click", () => setTab("shared"));
    $("tab-personal").addEventListener("click", () => setTab("personal"));
    $("personal-groups").addEventListener("change", onPersonalEvent);
    $("personal-groups").addEventListener("click", onPersonalEvent);
    $("personal-add-form").addEventListener("submit", onPersonalAdd);
    $("personal-restore").addEventListener("click", () => {
      PQ.personal.restoreHidden(state.code);
      renderPersonal();
    });

    document.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const to = btn.dataset.go;
        if (to === "home") goHome();
        else if (to === "create") goCreate();
        else if (to === "join") goJoin();
      });
    });
    $("brand-link").addEventListener("click", (e) => { e.preventDefault(); goHome(); });

    $("create-form").addEventListener("submit", onCreate);
    $("join-form").addEventListener("submit", onJoin);
    $("add-item-form").addEventListener("submit", onAddItem);
    $("item-groups").addEventListener("change", onItemEvent);
    $("item-groups").addEventListener("click", onItemEvent);
    $("delete-trip").addEventListener("click", onDeleteTrip);
    $("copy-code").addEventListener("click", onCopyCode);
    $("error-retry").addEventListener("click", () => { const r = state.retry; hideBanner(); if (r) r(); });
    $("error-close").addEventListener("click", hideBanner);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.code && state.pollTimer) load();
    });

    // 주소에 ?code=가 있으면 그 여행을 연다(토큰이 없으면 참여 화면에 코드를 채워 둔다).
    const code = PQ.normalizeCode(new URLSearchParams(location.search).get("code"));
    if (code) openTrip(code);
    else goHome();
  }

  init();
})();
