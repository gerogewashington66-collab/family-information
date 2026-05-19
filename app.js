(function () {
  const MS_DAY = 86400000;
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / MS_DAY);
  }

  function daysInYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  }

  /** 在指定公历年中，查找对应农历月日的公历日期 */
  function findSolarBirthdayInYear(lunarMonth, lunarDay, solarYear) {
    for (let m = 1; m <= 12; m++) {
      const dim = new Date(solarYear, m, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        try {
          const solar = Solar.fromYmd(solarYear, m, d);
          const lunar = solar.getLunar();
          if (lunar.getMonth() === lunarMonth && lunar.getDay() === lunarDay) {
            return { year: solarYear, month: m, day: d, date: new Date(solarYear, m - 1, d) };
          }
        } catch (_) {
          /* 无效日期跳过 */
        }
      }
    }
    return null;
  }

  function formatLunarBirthday(member) {
    return `农历 ${member.lunarYear}年${member.lunarMonth}月${member.lunarDay}日`;
  }

  function formatSolarDate(solar) {
    if (!solar) return "—";
    return `${solar.year}年${solar.month}月${solar.day}日`;
  }

  function getAge(member, solarYear) {
    const birthLunar = Lunar.fromYmd(member.lunarYear, member.lunarMonth, member.lunarDay);
    const birthSolar = birthLunar.getSolar();
    let age = solarYear - birthSolar.getYear();
    const thisBirth = findSolarBirthdayInYear(member.lunarMonth, member.lunarDay, solarYear);
    if (thisBirth) {
      const today = startOfDay(new Date());
      const bday = startOfDay(thisBirth.date);
      if (today < bday) age -= 1;
    }
    return Math.max(0, age);
  }

  function enrichMembers(year) {
    return FAMILY_MEMBERS.map((m) => {
      const solar = findSolarBirthdayInYear(m.lunarMonth, m.lunarDay, year);
      const today = startOfDay(new Date());
      let daysUntil = null;
      let isToday = false;
      let isPast = false;

      if (solar) {
        const bday = startOfDay(solar.date);
        const diff = Math.round((bday - today) / MS_DAY);
        isToday = diff === 0;
        isPast = diff < 0 && !isToday;
        daysUntil = isToday ? 0 : diff >= 0 ? diff : diff + daysInYear(year);
        if (diff < 0) {
          const nextYear = findSolarBirthdayInYear(m.lunarMonth, m.lunarDay, year + 1);
          if (nextYear) {
            daysUntil = Math.round((startOfDay(nextYear.date) - today) / MS_DAY);
            solar.next = nextYear;
          }
        }
      }

      return {
        ...m,
        solarThisYear: solar,
        age: getAge(m, year),
        daysUntil,
        isToday,
        isPast,
        lunarLabel: formatLunarBirthday(m),
      };
    });
  }

  function renderTodayDisplay() {
    const now = new Date();
    const solar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const lunar = solar.getLunar();
    const el = document.getElementById("todayDisplay");
    el.textContent = `今天是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]} · 农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  }

  function renderBirthdayAlerts(members) {
    const todayBirthdays = members.filter((m) => m.isToday);
    const zone = document.getElementById("alertZone");
    const card = document.getElementById("alertCard");

    if (todayBirthdays.length === 0) {
      zone.hidden = true;
      return;
    }

    zone.hidden = false;
    const names = todayBirthdays.map((m) => m.name).join("、");
    const ages = todayBirthdays.map((m) => `${m.name} ${m.age} 岁`).join(" · ");

    card.innerHTML = `
      <div class="alert-card__icon">🎂</div>
      <div class="alert-card__body">
        <h2 class="alert-card__title">今天是 ${names} 的农历生日！</h2>
        <p class="alert-card__msg">全家一起送上最温暖的祝福吧～ ${ages}</p>
        <p class="alert-card__wish">愿岁岁平安，喜乐常伴 🧡</p>
      </div>
    `;

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("刘家生日提醒", {
        body: `今天是 ${names} 的农历生日，记得送上祝福！`,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
      });
    }
  }

  function renderUpcoming(members) {
    const list = document.getElementById("upcomingList");
    const sorted = [...members]
      .filter((m) => m.solarThisYear && !m.isToday)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5);

    if (sorted.length === 0) {
      list.innerHTML = `<p class="upcoming__empty">近期暂无即将到来的生日</p>`;
      return;
    }

    list.innerHTML = sorted
      .map((m) => {
        const label =
          m.daysUntil === 0
            ? "今天"
            : m.daysUntil === 1
              ? "明天"
              : `${m.daysUntil} 天后`;
        return `
          <article class="upcoming-item gen-${m.generation}">
            <span class="upcoming-item__days">${label}</span>
            <div class="upcoming-item__info">
              <strong>${m.name}</strong>
              <span>${formatSolarDate(m.solarThisYear)} · ${m.lunarLabel}</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderGenerations(members) {
    const root = document.getElementById("generationsRoot");
    const byGen = [1, 2, 3].map((g) => ({
      gen: g,
      meta: GENERATION_META[g],
      members: members.filter((m) => m.generation === g),
    }));

    root.innerHTML = byGen
      .map(
        ({ gen, meta, members: group }) => `
        <section class="gen-block gen-block--${gen}">
          <header class="gen-block__head" style="--gen-color: ${meta.color}">
            <span class="gen-block__emoji">${meta.emoji}</span>
            <h2>${meta.title}</h2>
            <span class="gen-block__count">${group.length} 位家人</span>
          </header>
          <div class="gen-block__grid">
            ${group.map((m) => renderMemberCard(m)).join("")}
          </div>
        </section>
      `
      )
      .join("");
  }

  function renderMemberCard(m) {
    const statusClass = m.isToday ? "is-today" : m.daysUntil <= 7 && m.daysUntil > 0 ? "is-soon" : "";
    const badge = m.isToday
      ? '<span class="member-card__badge">今日生日</span>'
      : m.daysUntil <= 14 && m.daysUntil > 0
        ? `<span class="member-card__badge member-card__badge--soon">${m.daysUntil}天后</span>`
        : "";

    return `
      <article class="member-card ${statusClass}" data-gen="${m.generation}">
        ${badge}
        <h3 class="member-card__name">${m.name}</h3>
        <p class="member-card__lunar">${m.lunarLabel}</p>
        <p class="member-card__solar">今年公历：${formatSolarDate(m.solarThisYear)}</p>
        <p class="member-card__age">${m.age} 岁</p>
      </article>
    `;
  }

  /** 按横向间距分配上下方与层级，避免密集月份标签重叠 */
  function layoutTimelineMarkers(sorted, totalDays) {
    const MIN_GAP = 5.8;
    const items = sorted.map((m) => ({
      m,
      pct: ((dayOfYear(m.solarThisYear.date) - 1) / totalDays) * 100,
      side: "below",
      tier: 1,
    }));
    items.sort((a, b) => a.pct - b.pct);

    const laneEnds = {};

    function laneKey(side, tier) {
      return `${side}-${tier}`;
    }

    function canPlace(side, tier, pct) {
      const last = laneEnds[laneKey(side, tier)];
      return last === undefined || pct - last >= MIN_GAP;
    }

    function occupy(side, tier, pct) {
      laneEnds[laneKey(side, tier)] = pct;
    }

    const tryOrder = [
      ["below", 1],
      ["above", 1],
      ["below", 2],
      ["above", 2],
      ["below", 3],
      ["above", 3],
    ];

    for (const item of items) {
      let placed = false;
      for (const [side, tier] of tryOrder) {
        if (canPlace(side, tier, item.pct)) {
          item.side = side;
          item.tier = tier;
          occupy(side, tier, item.pct);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const belowLast = laneEnds[laneKey("below", 1)] ?? -Infinity;
        const aboveLast = laneEnds[laneKey("above", 1)] ?? -Infinity;
        item.side = item.pct - belowLast >= item.pct - aboveLast ? "below" : "above";
        item.tier = 3;
        occupy(item.side, item.tier, item.pct);
      }
    }

    return items;
  }

  function renderTimeline(members, year) {
    const withSolar = members.filter((m) => m.solarThisYear);
    const sorted = [...withSolar].sort(
      (a, b) => dayOfYear(a.solarThisYear.date) - dayOfYear(b.solarThisYear.date)
    );

    const totalDays = daysInYear(year);
    const markersEl = document.getElementById("timelineMarkers");
    const monthsEl = document.getElementById("timelineMonths");
    const todayEl = document.getElementById("timelineToday");
    const axisEl = document.getElementById("timelineAxis");

    const monthLabels = [];
    for (let m = 1; m <= 12; m++) {
      const pct = ((dayOfYear(new Date(year, m - 1, 1)) - 1) / totalDays) * 100;
      monthLabels.push(`<span style="left:${pct}%">${m}月</span>`);
    }
    monthsEl.innerHTML = monthLabels.join("");

    const today = new Date();
    if (today.getFullYear() === year) {
      const todayPct = ((dayOfYear(today) - 1) / totalDays) * 100;
      todayEl.hidden = false;
      todayEl.style.left = `${todayPct}%`;
    }

    const laidOut = layoutTimelineMarkers(sorted, totalDays);
    const maxTier = laidOut.reduce((max, it) => Math.max(max, it.tier), 1);
    axisEl.classList.toggle("timeline-axis--tall", maxTier >= 2);
    axisEl.classList.toggle("timeline-axis--extra-tall", maxTier >= 3);

    markersEl.innerHTML = laidOut
      .map(({ m, pct, side, tier }) => {
        const highlight = m.isToday ? " timeline-marker--today" : "";
        const dateStr = `${m.solarThisYear.month}/${m.solarThisYear.day}`;
        const labelBlock = `
          <div class="timeline-marker__label">
            <span class="timeline-marker__date">${dateStr}</span>
            <span class="timeline-marker__name">${m.name}</span>
          </div>
        `;
        const body =
          side === "above"
            ? `${labelBlock}<span class="timeline-marker__line"></span><span class="timeline-marker__dot"></span>`
            : `<span class="timeline-marker__dot"></span><span class="timeline-marker__line"></span>${labelBlock}`;
        return `
          <div class="timeline-marker timeline-marker--${side} timeline-marker--tier-${tier}${highlight}"
               style="left:${pct}%"
               title="${m.name} · ${formatSolarDate(m.solarThisYear)}">
            ${body}
          </div>
        `;
      })
      .join("");
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notify-btn";
      btn.textContent = "开启生日桌面提醒";
      btn.addEventListener("click", () => {
        Notification.requestPermission().then(() => btn.remove());
      });
      document.querySelector(".footer p").appendChild(btn);
    }
  }

  function init() {
    const year = new Date().getFullYear();
    const members = enrichMembers(year);

    renderTodayDisplay();
    renderBirthdayAlerts(members);
    renderUpcoming(members);
    renderGenerations(members);
    renderTimeline(members, year);
    requestNotificationPermission();

    document.title =
      members.some((m) => m.isToday)
        ? `🎂 生日快乐 · ${members.filter((m) => m.isToday).map((m) => m.name).join("、")}`
        : "刘家 · 生日温馨站";
  }

  if (typeof Solar === "undefined") {
    document.body.innerHTML =
      '<p style="padding:2rem;text-align:center">农历库加载失败，请检查网络后刷新页面。</p>';
    return;
  }

  init();
})();
