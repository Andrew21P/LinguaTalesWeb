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

  content.innerHTML = `
    <div class="grid">
      <div class="card"><div class="big">${d.totalUsers}</div><div class="label">Total Users</div></div>
      <div class="card"><div class="big">${d.premiumUsers}</div><div class="label">Premium Users</div></div>
      <div class="card"><div class="big">${d.totalBooks}</div><div class="label">Books Imported</div></div>
      <div class="card"><div class="big">${d.totalEvents}</div><div class="label">Total Events</div></div>
    </div>

    <div class="section">
      <h2>Events — Last 7 Days</h2>
      <div class="bar" style="margin-top:.5rem; margin-bottom:1.5rem; padding-bottom:1.2rem;">
        ${(d.last7days || []).map(r => `
          <div class="bar-col" style="height:${Math.max(4, (r.count / maxEvt) * 80)}px; flex:1;">
            <span class="tip">${r.count}</span>
            <span class="day">${r.day.slice(5)}</span>
          </div>
        `).join("")}
        ${(d.last7days || []).length === 0 ? '<span style="color:#5a7562;font-size:.85rem;">No data yet</span>' : ''}
      </div>
    </div>

    <div class="grid">
      <div class="section card">
        <h2>Event Breakdown</h2>
        <table>
          <tr><th>Event</th><th>Count</th></tr>
          ${(d.eventCounts || []).map(r => `<tr><td>${esc(r.event)}</td><td>${r.count}</td></tr>`).join("")}
        </table>
      </div>

      <div class="section card">
        <h2>Top Countries</h2>
        ${(d.topCountries || []).length ? (d.topCountries || []).map(r => `<span class="pill">${esc(r.country || "Unknown")} (${r.users})</span>`).join("") : '<span style="color:#5a7562;font-size:.85rem;">No data yet — country detection requires a GeoIP lookup.</span>'}
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

    <div class="section">
      <h2>Recent Events (Last 50)</h2>
      <div style="overflow-x:auto;">
        <table class="events-table">
          <tr><th>Time</th><th>Event</th><th>User</th><th>OS</th><th>Browser</th><th>Lang</th><th>Details</th></tr>
          ${(d.recentEvents || []).map(r => {
            let details = "";
            try { const p = JSON.parse(r.payload || "{}"); details = Object.entries(p).map(([k,v]) => `${k}: ${v}`).join(", "); } catch {}
            return `<tr>
              <td>${r.created_at}</td>
              <td><span class="pill">${esc(r.event)}</span></td>
              <td>${esc(r.email || r.name || "—")}</td>
              <td>${esc(r.os || "—")}</td>
              <td>${esc(r.browser || "—")}</td>
              <td>${esc(r.language || "—")}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(details || "—")}</td>
            </tr>`;
          }).join("")}
        </table>
      </div>
    </div>
  `;
}

function esc(s) {
  const el = document.createElement("span");
  el.textContent = String(s);
  return el.innerHTML;
}

document.getElementById("refresh").addEventListener("click", load);
load();
