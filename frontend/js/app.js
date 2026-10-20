/* 화면 전환, 체크리스트 그리기, 버튼 동작, 5초 폴링.
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
    tab: "shared",     // "shared"(함께 챙기기) 또는 "personal"(내 짐)
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
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
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
    const el = $(id);
    el.textContent = message || "";
    el.hidden = !message;
  }

  function label(group, value) {
    return (PQ.LABELS[group] && PQ.LABELS[group][value]) || value;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
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

  /* ---------- 시작 화면: 내가 들어간 여행 ---------- */

  function renderMyTrips() {
    const trips = PQ.tokenStore.list();
    const list = $("my-trips");
    list.replaceChildren();
    trips.forEach((t) => {
      const li = el("li");
      const btn = el("button");
      btn.type = "button";
      btn.append(el("strong", "", t.code));
      btn.append(document.createTextNode(` · ${t.nickname || "닉네임 없음"}${t.isHost ? " (주최자)" : ""}`));
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
      if (!picked) return showFormError("create-error", "국내/해외, 이동수단, 기간, 계절을 모두 골라 주세요.");
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
      toast("여행을 만들었어요. 공유 코드를 친구들에게 알려 주세요.");
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
      openTrip(res.code);
    } catch (err) {
      showFormError("join-error", err.message);
    } finally {
      submit.disabled = false;
    }
  }

  /* ---------- 체크리스트: 불러오기와 폴링 ---------- */

  function openTrip(code) {
    if (!PQ.tokenStore.get(code)) return goJoin(code);
    state.code = code;
    state.data = null;
    setUrlCode(code);
    $("item-groups").replaceChildren();
    $("personal-groups").replaceChildren();
    setTab("shared");
    $("share-code").textContent = code;
    $("trip-summary").textContent = "불러오는 중…";
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

  /* ---------- 체크리스트: 그리기 ---------- */

  function render() {
    const { trip, me, members, items, progress } = state.data;
    const isHost = me.is_host;
    const nameOf = new Map(members.map((m) => [m.member_id, m.nickname]));

    // 여행 정보와 공유 코드
    $("trip-summary").textContent = ["region", "transport", "duration", "season"]
      .map((key) => label(key, trip[key])).join(" · ");
    $("share-code").textContent = trip.code;
    $("me-line").textContent = `${me.nickname}님으로 참여 중${isHost ? " (주최자)" : ""}`;
    document.querySelectorAll("#view-trip .trip-side .host-only").forEach((node) => { node.hidden = !isHost; });

    // 팀 진행률
    $("progress-rate").textContent = progress.rate + "%";
    $("progress-fill").style.width = progress.rate + "%";
    $("progress-bar").setAttribute("aria-valuenow", progress.rate);
    $("progress-sub").textContent =
      `${progress.done}/${progress.total}개 완료 · 담당자 없는 항목 ${progress.unassigned}개`;

    // 참여자별 진행률
    const byMember = new Map(progress.by_member.map((b) => [b.member_id, b]));
    const memberList = $("member-list");
    memberList.replaceChildren();
    members.forEach((m) => {
      const stat = byMember.get(m.member_id) || { assigned: 0, done: 0, rate: 0 };
      const li = el("li");
      const name = el("span", m.member_id === me.member_id ? "is-me" : "",
        m.nickname + (m.is_host ? " (주최자)" : "") + (m.member_id === me.member_id ? " · 나" : ""));
      const count = el("span", "", `${stat.done}/${stat.assigned} · ${stat.rate}%`);
      const bar = el("div", "bar");
      const fill = el("span", "bar__fill");
      fill.style.width = stat.rate + "%";
      bar.append(fill);
      li.append(name, count, bar);
      memberList.append(li);
    });

    $("shared-count").textContent = `${progress.done}/${progress.total}`;
    renderPersonal();

    // 담당자 선택 목록을 펼친 채 고르는 중이면 목록을 다시 그리지 않는다(폴링이 선택을 닫지 않게).
    const active = document.activeElement;
    if (active && active.tagName === "SELECT" && $("item-groups").contains(active)) return;
    renderItems(items, me, isHost, members, nameOf);
  }

  function renderItems(items, me, isHost, members, nameOf) {
    const groups = $("item-groups");
    const template = $("item-template");
    groups.replaceChildren();

    if (items.length === 0) {
      groups.append(el("p", "card", "아직 함께 챙길 준비물이 없어요. 아래에서 항목을 추가해 보세요."));
      return;
    }

    // 항목이 있는 분류만 보여준다(예: 당일 여행은 의류·세면이 비어 있을 수 있다).
    PQ.CATEGORY_ORDER.forEach((category) => {
      const inCategory = items.filter((i) => i.category === category);
      if (inCategory.length === 0) return;

      const section = el("section", "card group");
      const title = el("h2", "group__title", label("category", category));
      title.append(el("span", "group__count", `${inCategory.filter((i) => i.done).length}/${inCategory.length}`));
      const list = el("ul", "items");

      inCategory.forEach((item) => {
        const node = template.content.firstElementChild.cloneNode(true);
        const mine = item.assignee_id === me.member_id;
        node.dataset.itemId = item.item_id;
        node.classList.toggle("is-done", item.done);
        node.classList.toggle("is-mine", mine);

        node.querySelector(".item__name").textContent = item.name;

        const check = node.querySelector(".item__done");
        check.checked = item.done;
        check.disabled = !mine; // 완료 체크는 담당자만
        check.title = mine ? "" : item.assignee_id === null ? "먼저 담당자를 정해 주세요." : "담당자만 체크할 수 있어요.";

        const assigneeText = node.querySelector(".item__assignee");
        assigneeText.textContent =
          item.assignee_id === null ? "담당자 없음" : (nameOf.get(item.assignee_id) || "알 수 없음") + (mine ? " (나)" : "");
        assigneeText.hidden = isHost; // 주최자는 담당자 선택 상자에 이름이 보인다

        node.querySelector(".item__claim").hidden = item.assignee_id !== null;
        node.querySelector(".item__release").hidden = !mine;

        const assign = node.querySelector(".item__assign");
        const del = node.querySelector(".item__delete");
        assign.hidden = !isHost;
        del.hidden = !isHost;
        if (isHost) {
          const none = el("option", "", "담당자 없음");
          none.value = "";
          assign.append(none);
          members.forEach((m) => {
            const opt = el("option", "", m.nickname);
            opt.value = String(m.member_id);
            assign.append(opt);
          });
          assign.value = item.assignee_id === null ? "" : String(item.assignee_id);
        }

        list.append(node);
      });

      section.append(title, list);
      groups.append(section);
    });
  }

  /* ---------- 내 짐 (서버를 거치지 않는다) ---------- */

  function setTab(tab) {
    state.tab = tab;
    ["shared", "personal"].forEach((name) => {
      $("tab-" + name).setAttribute("aria-selected", String(name === tab));
      $("panel-" + name).hidden = name !== tab;
    });
  }

  function renderPersonal() {
    if (!state.code || !state.data) return;
    const view = PQ.personal.view(state.code, state.data.trip);

    $("personal-count").textContent = `${view.done}/${view.total}`;
    $("personal-rate").textContent = view.rate + "%";
    $("personal-fill").style.width = view.rate + "%";
    $("personal-bar").setAttribute("aria-valuenow", view.rate);
    $("personal-sub").textContent = `${view.done}/${view.total}개 챙김 · 이 기기에만 저장`;

    const restore = $("personal-restore");
    restore.hidden = view.hiddenCount === 0;
    restore.textContent = `숨긴 추천 항목 다시 보기 (${view.hiddenCount})`;

    const groups = $("personal-groups");
    const template = $("personal-template");
    groups.replaceChildren();
    if (view.items.length === 0) {
      groups.append(el("p", "card", "내 짐이 비어 있어요. 아래에서 직접 추가해 보세요."));
      return;
    }

    PQ.CATEGORY_ORDER.forEach((category) => {
      const inCategory = view.items.filter((i) => i.category === category);
      if (inCategory.length === 0) return;

      const section = el("section", "card group");
      const title = el("h2", "group__title", label("category", category));
      title.append(el("span", "group__count", `${inCategory.filter((i) => i.done).length}/${inCategory.length}`));
      const list = el("ul", "items");

      inCategory.forEach((item) => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.dataset.key = item.key;
        node.classList.toggle("is-done", item.done);
        node.querySelector(".item__name").textContent = item.name;
        node.querySelector(".item__done").checked = item.done;
        node.querySelector(".item__tag").hidden = !item.custom;
        const remove = node.querySelector(".personal__remove");
        remove.textContent = item.custom ? "삭제" : "숨기기";
        remove.setAttribute("aria-label", `${item.name} ${item.custom ? "삭제" : "숨기기"}`);
        list.append(node);
      });

      section.append(title, list);
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
      return showFormError("personal-add-error", `항목 이름은 1~${PQ.LIMITS.itemNameMax}자로 입력해 주세요.`);
    }
    showFormError("personal-add-error", "");
    PQ.personal.add(state.code, name, form.elements.category.value);
    form.elements.name.value = "";
    renderPersonal();
    toast(`"${name}"을(를) 내 짐에 추가했어요.`);
  }

  /* ---------- 체크리스트: 버튼 동작 ---------- */

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
      if (confirm(`"${name}" 항목을 삭제할까요?`)) {
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
      return showFormError("add-item-error", `항목 이름은 1~${PQ.LIMITS.itemNameMax}자로 입력해 주세요.`);
    }
    showFormError("add-item-error", "");
    await runAction(async (code) => {
      await PQ.api.addItem(code, { name, category });
      form.elements.name.value = "";
      toast(`"${name}" 항목을 추가했어요.`);
    });
  }

  async function onDeleteTrip() {
    if (!state.code) return;
    if (!confirm("여행을 삭제하면 참여자와 준비물이 모두 지워지고 되돌릴 수 없어요. 삭제할까요?")) return;
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
      toast("공유 코드를 복사했어요.");
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
    // 항목 추가의 분류 선택지 (함께 챙기기, 내 짐)
    ["add-item-category", "personal-add-category"].forEach((id) => {
      const select = $(id);
      PQ.CATEGORY_ORDER.forEach((c) => {
        const opt = el("option", "", label("category", c));
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
