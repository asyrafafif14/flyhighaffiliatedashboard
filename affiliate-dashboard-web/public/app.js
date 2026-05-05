const currency = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-MY");
const percent = new Intl.NumberFormat("en-MY", {
  style: "percent",
  maximumFractionDigits: 1,
});

let dashboardData;
let selectedAffiliateId;

function $(selector) {
  return document.querySelector(selector);
}

function formatCurrency(value) {
  return currency.format(value ?? 0).replace("MYR", "RM");
}

function shortName(name, max = 22) {
  if (!name) return "";
  return name.length > max ? `${name.slice(0, max - 1)}...` : name;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderKpis(data) {
  setText("sourceFile", data.source.file);
  setText("totalPaidRevenue", formatCurrency(data.kpis.totalPaidRevenue));
  setText("paidAffiliateRevenue", formatCurrency(data.kpis.paidAffiliateRevenue));
  setText("paidUnreferredRevenue", formatCurrency(data.kpis.paidUnreferredRevenue));
  setText("paidAffiliateTransactions", number.format(data.kpis.paidAffiliateTransactions));
  setText("referralCoverage", percent.format(data.kpis.referralCoverage));
  setText("activeAffiliates", number.format(data.kpis.paidActiveAffiliates));
  setText("privacyText", data.source.privacy);
}

function renderAffiliateChart(affiliates) {
  const container = $("#affiliateChart");
  const top = affiliates.slice(0, 10);
  const max = Math.max(...top.map((affiliate) => affiliate.paidRevenue), 1);

  container.innerHTML = top
    .map((affiliate) => {
      const width = Math.max(4, (affiliate.paidRevenue / max) * 100);
      return `
        <div class="bar-row">
          <span class="bar-label" title="${affiliate.name}">${shortName(affiliate.name, 18)}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${width}%"></span></span>
          <span class="bar-value">${formatCurrency(affiliate.paidRevenue)}</span>
        </div>
      `;
    })
    .join("");
}

function renderDailyChart(daily) {
  const svg = $("#dailyChart");
  const width = 720;
  const height = 278;
  const padding = { top: 18, right: 18, bottom: 34, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = daily.map((point) => point.paidAffiliateRevenue);
  const max = Math.max(...values, 1);
  const xStep = daily.length > 1 ? plotWidth / (daily.length - 1) : plotWidth;

  const y = (value) => padding.top + plotHeight - (value / max) * plotHeight;
  const x = (index) => padding.left + index * xStep;
  const path = daily.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.paidAffiliateRevenue)}`).join(" ");

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const lineY = padding.top + plotHeight - ratio * plotHeight;
      const label = formatCurrency(max * ratio);
      return `
        <line class="grid" x1="${padding.left}" x2="${width - padding.right}" y1="${lineY}" y2="${lineY}"></line>
        <text x="8" y="${lineY + 4}">${label}</text>
      `;
    })
    .join("");

  const xLabels = daily
    .filter((_, index) => index % 4 === 0 || index === daily.length - 1)
    .map((point, index, filtered) => {
      const originalIndex = daily.indexOf(point);
      const anchor = index === filtered.length - 1 ? "end" : "middle";
      return `<text x="${x(originalIndex)}" y="${height - 10}" text-anchor="${anchor}">${point.label.slice(0, 5)}</text>`;
    })
    .join("");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    ${gridLines}
    <path class="trend" d="${path}"></path>
    ${xLabels}
  `;
}

function renderAffiliateRows(affiliates) {
  const tbody = $("#affiliateRows");
  tbody.innerHTML = affiliates
    .map(
      (affiliate) => `
        <tr class="${affiliate.id === selectedAffiliateId ? "selected" : ""}">
          <td><button class="affiliate-button" data-affiliate-id="${affiliate.id}">${affiliate.name}</button></td>
          <td>${affiliate.code}</td>
          <td class="numeric">${number.format(affiliate.paidTransactions)}</td>
          <td class="numeric">${formatCurrency(affiliate.paidRevenue)}</td>
          <td class="numeric">${percent.format(affiliate.revenueShare)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderProductRows(affiliate) {
  const products = dashboardData.productBreakdown
    .filter((product) => product.affiliateId === affiliate.id)
    .sort((a, b) => b.paidRevenue - a.paidRevenue || b.paidTransactions - a.paidTransactions);

  setText("detailTitle", affiliate.name);
  setText("detailSubtitle", `${affiliate.code} - ${affiliate.firstPaidDate || "No paid date"} to ${affiliate.lastPaidDate || "No paid date"}`);
  setText("detailProducts", number.format(affiliate.productsSold));
  setText("detailRevenue", formatCurrency(affiliate.paidRevenue));
  setText("detailTransactions", number.format(affiliate.paidTransactions));
  setText("detailAverage", formatCurrency(affiliate.averageTicket));

  $("#productRows").innerHTML = products
    .map(
      (product) => `
        <tr>
          <td title="${product.product}">${shortName(product.product, 44)}</td>
          <td class="numeric">${number.format(product.paidTransactions)}</td>
          <td class="numeric">${formatCurrency(product.paidRevenue)}</td>
          <td class="numeric">${number.format(product.pendingTransactions)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderTopProducts(products) {
  $("#topProducts").innerHTML = products
    .slice(0, 12)
    .map(
      (product) => `
        <article class="product-card">
          <h3 title="${product.product}">${product.product}</h3>
          <strong>${formatCurrency(product.paidRevenue)}</strong>
          <p>${number.format(product.paidTransactions)} total paid transactions</p>
          <div class="top-affiliate">
            <span>Highest affiliate</span>
            <b>${product.topAffiliateName} - ${product.topAffiliateCode}</b>
            <em>${formatCurrency(product.topAffiliatePaidRevenue)} · ${number.format(product.topAffiliatePaidTransactions)} txns</em>
          </div>
        </article>
      `,
    )
    .join("");
}

function selectAffiliate(id) {
  const affiliate = dashboardData.affiliates.find((item) => item.id === id) ?? dashboardData.affiliates[0];
  selectedAffiliateId = affiliate.id;
  renderAffiliateRows(getFilteredAffiliates());
  renderProductRows(affiliate);
}

function getFilteredAffiliates() {
  const query = $("#affiliateSearch").value.trim().toLowerCase();
  if (!query) return dashboardData.affiliates;
  return dashboardData.affiliates.filter((affiliate) => {
    return `${affiliate.name} ${affiliate.code}`.toLowerCase().includes(query);
  });
}

function bindEvents() {
  $("#affiliateRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-affiliate-id]");
    if (!button) return;
    selectAffiliate(button.dataset.affiliateId);
  });

  $("#affiliateSearch").addEventListener("input", () => {
    const filtered = getFilteredAffiliates();
    renderAffiliateRows(filtered);
    if (!filtered.some((affiliate) => affiliate.id === selectedAffiliateId) && filtered[0]) {
      renderProductRows(filtered[0]);
    }
  });
}

async function init() {
  const response = await fetch("./data/dashboard.json");
  dashboardData = await response.json();
  selectedAffiliateId = dashboardData.affiliates[0]?.id;

  renderKpis(dashboardData);
  renderAffiliateChart(dashboardData.affiliates);
  renderDailyChart(dashboardData.daily);
  renderAffiliateRows(dashboardData.affiliates);
  renderTopProducts(dashboardData.topProducts);
  if (selectedAffiliateId) selectAffiliate(selectedAffiliateId);
  bindEvents();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="error-state"><h1>Dashboard data failed to load</h1><p>${error.message}</p></main>`;
});
