import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const sourceCsv = path.join(workspaceRoot, "Full LMS Report April.csv");
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");
const dataDir = path.join(distDir, "data");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += ch;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function toObjects(rows) {
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header] = row[index] ?? "";
    });
    return out;
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function hasReferralValue(value) {
  const text = clean(value);
  return text !== "" && text !== "-";
}

function amount(value) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(row) {
  return clean(row.Status).toLowerCase();
}

function isReferred(row) {
  return hasReferralValue(row["Referred By"]) || hasReferralValue(row["Referrer Name"]);
}

function affiliateName(row) {
  return hasReferralValue(row["Referrer Name"]) ? clean(row["Referrer Name"]) : "(Name missing)";
}

function affiliateCode(row) {
  return hasReferralValue(row["Referred By"]) ? clean(row["Referred By"]) : "(Code missing)";
}

function affiliateKey(name, code) {
  return `${name}||${code}`;
}

function parseDate(value) {
  const [month, day, year] = clean(value).split("/").map(Number);
  if (!month || !day || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function ensureGroup(map, key, factory) {
  if (!map.has(key)) map.set(key, factory());
  return map.get(key);
}

function summarize(rows) {
  const paid = rows.filter((row) => status(row) === "paid");
  const pending = rows.filter((row) => status(row) === "pending");
  const paidReferred = paid.filter(isReferred);
  const paidUnreferred = paid.filter((row) => !isReferred(row));
  const pendingReferred = pending.filter(isReferred);

  const totalPaidRevenue = paid.reduce((sum, row) => sum + amount(row["Amount (RM)"]), 0);
  const paidAffiliateRevenue = paidReferred.reduce((sum, row) => sum + amount(row["Amount (RM)"]), 0);
  const paidUnreferredRevenue = paidUnreferred.reduce((sum, row) => sum + amount(row["Amount (RM)"]), 0);
  const pendingReferredRevenue = pendingReferred.reduce((sum, row) => sum + amount(row["Amount (RM)"]), 0);

  const affiliatesMap = new Map();
  const productsMap = new Map();
  const dailyMap = new Map();

  for (const row of rows) {
    const rowStatus = status(row);
    const rowAmount = amount(row["Amount (RM)"]);
    const date = parseDate(row.Date);
    const daily = ensureGroup(dailyMap, date, () => ({
      date,
      label: displayDate(date),
      paidAffiliateTransactions: 0,
      paidAffiliateRevenue: 0,
      paidUnreferredTransactions: 0,
      paidUnreferredRevenue: 0,
      pendingReferredTransactions: 0,
      pendingReferredRevenue: 0,
    }));

    if (rowStatus === "paid" && isReferred(row)) {
      daily.paidAffiliateTransactions += 1;
      daily.paidAffiliateRevenue += rowAmount;
    } else if (rowStatus === "paid") {
      daily.paidUnreferredTransactions += 1;
      daily.paidUnreferredRevenue += rowAmount;
    } else if (rowStatus === "pending" && isReferred(row)) {
      daily.pendingReferredTransactions += 1;
      daily.pendingReferredRevenue += rowAmount;
    }

    if (!isReferred(row)) continue;

    const name = affiliateName(row);
    const code = affiliateCode(row);
    const affKey = affiliateKey(name, code);
    const affiliate = ensureGroup(affiliatesMap, affKey, () => ({
      id: affKey,
      name,
      code,
      paidTransactions: 0,
      paidRevenue: 0,
      pendingTransactions: 0,
      pendingRevenue: 0,
      productsSold: 0,
      firstPaidDate: "",
      lastPaidDate: "",
      productKeys: new Set(),
    }));

    const productName = clean(row.Product) || "(Product missing)";
    const productKey = `${affKey}||${productName}`;
    const product = ensureGroup(productsMap, productKey, () => ({
      affiliateId: affKey,
      affiliateName: name,
      affiliateCode: code,
      product: productName,
      paidTransactions: 0,
      paidRevenue: 0,
      pendingTransactions: 0,
      pendingRevenue: 0,
    }));

    if (rowStatus === "paid") {
      affiliate.paidTransactions += 1;
      affiliate.paidRevenue += rowAmount;
      affiliate.productKeys.add(productKey);
      product.paidTransactions += 1;
      product.paidRevenue += rowAmount;
      if (date && (!affiliate.firstPaidDate || date < affiliate.firstPaidDate)) affiliate.firstPaidDate = date;
      if (date && (!affiliate.lastPaidDate || date > affiliate.lastPaidDate)) affiliate.lastPaidDate = date;
    } else if (rowStatus === "pending") {
      affiliate.pendingTransactions += 1;
      affiliate.pendingRevenue += rowAmount;
      product.pendingTransactions += 1;
      product.pendingRevenue += rowAmount;
    }
  }

  const productBreakdown = [...productsMap.values()]
    .filter((product) => product.paidTransactions > 0 || product.pendingTransactions > 0)
    .sort((a, b) => b.paidRevenue - a.paidRevenue || b.paidTransactions - a.paidTransactions || a.product.localeCompare(b.product));

  const affiliates = [...affiliatesMap.values()]
    .map((affiliate) => ({
      id: affiliate.id,
      name: affiliate.name,
      code: affiliate.code,
      paidTransactions: affiliate.paidTransactions,
      paidRevenue: affiliate.paidRevenue,
      pendingTransactions: affiliate.pendingTransactions,
      pendingRevenue: affiliate.pendingRevenue,
      averageTicket: affiliate.paidTransactions ? affiliate.paidRevenue / affiliate.paidTransactions : 0,
      revenueShare: paidAffiliateRevenue ? affiliate.paidRevenue / paidAffiliateRevenue : 0,
      productsSold: affiliate.productKeys.size,
      firstPaidDate: displayDate(affiliate.firstPaidDate),
      lastPaidDate: displayDate(affiliate.lastPaidDate),
    }))
    .filter((affiliate) => affiliate.paidTransactions > 0 || affiliate.pendingTransactions > 0)
    .sort((a, b) => b.paidRevenue - a.paidRevenue || b.paidTransactions - a.paidTransactions || a.name.localeCompare(b.name));

  const topProducts = productBreakdown.slice(0, 20);
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    generatedAt: new Date().toISOString(),
    source: {
      file: "Full LMS Report April.csv",
      privacy: "Raw CSV is used at build time only. Public JSON excludes student names, parent names, phone numbers, payment references, and transaction-level rows.",
    },
    kpis: {
      totalTransactions: rows.length,
      paidTransactions: paid.length,
      pendingTransactions: pending.length,
      paidAffiliateTransactions: paidReferred.length,
      paidUnreferredTransactions: paidUnreferred.length,
      totalPaidRevenue,
      paidAffiliateRevenue,
      paidUnreferredRevenue,
      pendingReferredTransactions: pendingReferred.length,
      pendingReferredRevenue,
      referralCoverage: paid.length ? paidReferred.length / paid.length : 0,
      averageAffiliateTicket: paidReferred.length ? paidAffiliateRevenue / paidReferred.length : 0,
      paidActiveAffiliates: affiliates.filter((affiliate) => affiliate.paidTransactions > 0).length,
    },
    affiliates,
    productBreakdown,
    topProducts,
    daily,
  };
}

async function copyPublic() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.cp(publicDir, distDir, { recursive: true });
}

const csvText = await fs.readFile(sourceCsv, "utf8");
const data = summarize(toObjects(parseCsv(csvText)));
await copyPublic();
await fs.writeFile(path.join(dataDir, "dashboard.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Built ${path.relative(workspaceRoot, path.join(dataDir, "dashboard.json"))}`);
console.log(`Paid affiliate revenue: RM ${data.kpis.paidAffiliateRevenue.toLocaleString("en-MY")}`);
