async function load() {
  const content = document.getElementById("content");
  try {
    const res = await fetch("/api/admin/analytics", { credentials: "same-origin" });
    if (!res.ok) {
      content.innerHTML = `<div class="loading">${res.status === 401 ? 'Not logged in.' : res.status === 403 ? 'Access denied — admin only.' : 'Server error.'} <a href="/">Go to Voxenor</a></div>`;
      return;
    }
    const d = await res.json();
    render(d);
  } catch (e) {
    content.innerHTML = `<div class="loading">Error loading analytics: ${e.message}</div>`;
  }
}

function render(d) {
  const content = document.getElementById("content");
  const maxEvt = Math.max(...(d.last7days || []).map(r => r.count), 1);

  // Build user-books lookup
  const booksByUser = {};
  for (const ub of (d.userBooks || [])) {
    if (!booksByUser[ub.user_id]) booksByUser[ub.user_id] = [];
    booksByUser[ub.user_id].push(ub);
  }

  content.innerHTML = `
    <!-- KPI Cards -->
    <div class="grid">
      <div class="card"><div class="big">${d.totalUsers}</div><div class="label">Total Users</div></div>
      <div class="card"><div class="big">${d.premiumUsers}</div><div class="label">Premium Users</div></div>
      <div class="card"><div class="big">${d.activeToday || 0}</div><div class="label">Active Today</div></div>
      <div class="card"><div class="big">${d.activeLast7 || 0}</div><div class="label">Active 7 Days</div></div>
      <div class="card"><div class="big">${d.totalBooks}</div><div class="label">Books Imported</div></div>
      <div class="card"><div class="big">${d.totalWords || 0}</div><div class="label">Saved Words</div></div>
      <div class="card"><div class="big">${d.totalEvents}</div><div class="label">Total Events</div></div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <div class="tab active" data-tab="overview">Overview</div>
      <div class="tab" data-tab="users">Users (${d.totalUsers})</div>
      <div class="tab" data-tab="events">Events</div>
    </div>

    <!-- Overview Tab -->
    <div class="tab-panel active" id="tab-overview">
      <div class="section">
        <h2>Events — Last 7 Days</h2>
        <div class="bar" style="margin-top:.5rem; margin-bottom:1.5rem; padding-bottom:1.2rem;">
          ${(d.last7days || []).map(r => `
            <div class="bar-col" style="height:${Math.max(4, (r.count / maxEvt) * 80)}px; flex:1;">
              <span class="tip">${r.count}</span>
              <span class="day">${r.day.slice(5)}</span>
            </div>
          `).join("")}
          ${(d.last7days || []).length === 0 ? '<span class="muted">No data yet</span>' : ''}
        </div>
      </div>

      <div class="grid grid-wide">
        <div class="section card">
          <h2>Event Breakdown</h2>
          <table>
            <tr><th>Event</th><th>Count</th></tr>
            ${(d.eventCounts || []).map(r => `<tr><td>${esc(r.event)}</td><td>${r.count}</td></tr>`).join("")}
          </table>
        </div>

        <div class="section card">
          <h2>Import Sources</h2>
          ${(d.sourceBreakdown || []).length ? `<table>
            <tr><th>Source</th><th>Books</th></tr>
            ${(d.sourceBreakdown || []).map(r => `<tr><td><span class="pill pill-${r.source}">${esc(r.source)}</span></td><td>${r.count}</td></tr>`).join("")}
          </table>` : '<span class="muted">No data yet</span>'}
        </div>

        <div class="section card">
          <h2>Countries</h2>
          ${(d.topCountries || []).length ? (d.topCountries || []).map(r => `<span class="pill">${esc(r.country || "Unknown")} (${r.users})</span>`).join("") : '<span class="muted">No country data yet — GeoIP resolves on next visits.</span>'}
        </div>

        <div class="section card">
          <h2>Operating Systems</h2>
          <table>
            <tr><th>OS</th><th>Users</th></tr>
            ${(d.topOS || []).map(r => `<tr><td>${esc(r.os)}</td><td>${r.users}</td></tr>`).join("")}
          </table>
        </div>

        <div class="section card">
          <h2>Browsers</h2>
          <table>
            <tr><th>Browser</th><th>Users</th></tr>
            ${(d.topBrowsers || []).map(r => `<tr><td>${esc(r.browser)}</td><td>${r.users}</td></tr>`).join("")}
          </table>
        </div>

        <div class="section card">
          <h2>Languages</h2>
          ${(d.topLanguages || []).map(r => `<span class="pill">${esc(r.language)} (${r.users})</span>`).join("")}
        </div>

        <div class="section card">
          <h2>Signups — Last 30 Days</h2>
          <table>
            <tr><th>Date</th><th>New Users</th></tr>
            ${(d.recentSignups || []).map(r => `<tr><td>${r.day}</td><td>${r.count}</td></tr>`).join("")}
          </table>
        </div>
      </div>
    </div>

    <!-- Users Tab -->
    <div class="tab-panel" id="tab-users">
      <div class="section">
        <h2>All Users</h2>
        <div class="scroll-table">
          <table id="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Country</th>
                <th>Books</th>
                <th>Words</th>
                <th>OS</th>
                <th>Browser</th>
                <th>Lang</th>
                <th>Last Active</th>
                <th>Signed Up</th>
              </tr>
            </thead>
            <tbody>
              ${(d.userList || []).map((u, i) => {
                const books = booksByUser[u.id] || [];
                const planClass = (u.plan === "premium" || u.subscription_status === "active") ? "pill-premium" : "pill-free";
                const planLabel = (u.plan === "premium" || u.subscription_status === "active") ? "Premium" : "Free";
                return `
                  <tr>
                    <td>${esc(u.name || "—")}</td>
                    <td>${esc(u.email)}</td>
                    <td><span class="pill ${planClass}">${planLabel}</span></td>
                    <td>${esc(u.country || "—")}</td>
                    <td>${books.length > 0 ? `<span class="toggle-books" data-idx="${i}">${u.book_count} book${u.book_count !== 1 ? "s" : ""}</span>` : '<span class="muted">0</span>'}</td>
                    <td>${u.word_count || 0}</td>
                    <td>${esc(u.os || "—")}</td>
                    <td>${esc(u.browser || "—")}</td>
                    <td>${esc(u.language || "—")}</td>
                    <td class="muted">${u.last_active ? u.last_active.slice(0, 16).replace("T", " ") : "—"}</td>
                    <td class="muted">${u.created_at ? u.created_at.slice(0, 10) : "—"}</td>
                  </tr>
                  <tr class="user-books-row" id="books-row-${i}">
                    <td colspan="11">
                      ${books.length ? `<table class="mini-table">
                        <tr><th>Title</th><th>Source</th><th>Type</th><th>Detected Lang</th><th>Audio Lang</th><th>Pages</th><th>Added</th></tr>
                        ${books.map(b => `<tr>
                          <td>${esc(b.title || b.book_id.slice(0, 8))}</td>
                          <td><span class="pill pill-${b.source}">${esc(b.source)}</span></td>
                          <td>${esc(b.sourceType || "—")}</td>
                          <td>${esc(b.detectedLanguage || "—")}</td>
                          <td>${esc(b.audiobookLanguage || "—")}</td>
                          <td>${b.totalPages || "—"}</td>
                          <td class="muted">${b.created_at ? b.created_at.slice(0, 10) : "—"}</td>
                        </tr>`).join("")}
                      </table>` : ""}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Events Tab -->
    <div class="tab-panel" id="tab-events">
      <div class="section">
        <h2>Recent Events (Last 50)</h2>
        <div class="scroll-table">
          <table class="events-table">
            <thead>
              <tr><th>Time</th><th>Event</th><th>User</th><th>Country</th><th>OS</th><th>Browser</th><th>Lang</th><th>Details</th></tr>
            </thead>
            <tbody>
              ${(d.recentEvents || []).map(r => {
                let details = "";
                try { const p = JSON.parse(r.payload || "{}"); details = Object.entries(p).map(([k,v]) => k + ": " + v).join(", "); } catch {}
                return `<tr>
                  <td>${r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : ""}</td>
                  <td><span class="pill">${esc(r.event)}</span></td>
                  <td>${esc(r.email || r.name || "—")}</td>
                  <td>${esc(r.country || "—")}</td>
                  <td>${esc(r.os || "—")}</td>
                  <td>${esc(r.browser || "—")}</td>
                  <td>${esc(r.language || "—")}</td>
                  <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(details || "—")}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Wire up tabs
  content.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      content.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      content.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById("tab-" + tab.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });

  // Wire up expandable book rows
  content.querySelectorAll(".toggle-books").forEach(el => {
    el.addEventListener("click", () => {
      const row = document.getElementById("books-row-" + el.dataset.idx);
      if (row) row.classList.toggle("open");
    });
  });
}

function esc(s) {
  const el = document.createElement("span");
  el.textContent = String(s);
  return el.innerHTML;
}

document.getElementById("refresh").addEventListener("click", load);
load();
