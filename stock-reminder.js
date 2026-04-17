const axios = require("axios");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const dailyWord = require("./daily-word");

const DATA_DIR = process.env.DATA_DIR || __dirname;
const STOCK_CONFIG_FILE = path.join(DATA_DIR, "stock-config.json");
const MAX_RETRY = 3;
const RETRY_DELAY = 2000;
const EMBED_COLOR = "#2ECC71";
const DEFAULT_TIME = "08:30";
const DEFAULT_TIMEZONE = "Asia/Taipei";
const INTERNATIONAL_ITEMS = 7;
const STOCK_WORD_PAGE_PREFIX = "stock-word-page:";
const STOCK_PAGE = "stock";
const WORD_PAGE = "word";
const STOCK_WORD_PAGE_TTL_MS = 24 * 60 * 60 * 1000;
const stockWordPageStore = new Map();

const FINANCE_FEEDS = {
  international: [
    "https://news.google.com/rss/search?q=%E5%9C%8B%E9%9A%9B+%E8%B2%A1%E7%B6%93&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    "https://news.google.com/rss/search?q=global+economy+geopolitics&hl=en-US&gl=US&ceid=US:en",
  ],
};

const FALLBACK_DIGEST = {
  international: [
    { title: "暫無即時摘要，請留意主要央行與地緣政治消息。", link: null },
  ],
  indices: [
    "🇺🇸 S&P 500      N/A  --",
    "🇺🇸 Dow Jones    N/A  --",
    "🇺🇸 Nasdaq 100   N/A  --",
    "🇯🇵 日經225      N/A  --",
    "🇨🇳 上證指數      N/A  --",
    "🇹🇼 台指夜盤      N/A  --",
  ],
  twClose: "🇹🇼 加權指數      N/A  --",
};

const US_INDEX_SYMBOLS = [
  { label: "S&P 500", symbol: "^spx", marketEmoji: "🇺🇸" },
  { label: "Dow Jones", symbol: "^dji", marketEmoji: "🇺🇸" },
  { label: "Nasdaq 100", symbol: "^ndq", marketEmoji: "🇺🇸" },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadStockConfig() {
  if (fs.existsSync(STOCK_CONFIG_FILE)) {
    const data = fs.readFileSync(STOCK_CONFIG_FILE, "utf8");
    return JSON.parse(data);
  }
  return { version: "1.0", guilds: {} };
}

function saveStockConfig(config) {
  fs.writeFileSync(STOCK_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getGuildStockConfig(guildId) {
  const config = loadStockConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      enabled: false,
      channelId: null,
      sendTime: DEFAULT_TIME,
      mentionUserId: null,
      timezone: DEFAULT_TIMEZONE,
      lastSentDate: null,
      totalSent: 0,
      lastMessageId: null,
    };
    saveStockConfig(config);
  }
  return config.guilds[guildId];
}

function updateGuildStockConfig(guildId, updates) {
  const config = loadStockConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      enabled: false,
      channelId: null,
      sendTime: DEFAULT_TIME,
      mentionUserId: null,
      timezone: DEFAULT_TIMEZONE,
      lastSentDate: null,
      totalSent: 0,
      lastMessageId: null,
    };
  }
  Object.assign(config.guilds[guildId], updates);
  saveStockConfig(config);
}

function sanitizeText(text) {
  return (text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeUrl(url) {
  const value = (url || "").trim();
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return null;
}

function parseNumber(value) {
  const num = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function toRocDateString(dateText) {
  if (!dateText || dateText.length !== 7) {
    return dateText || "N/A";
  }
  const rocYear = Number(dateText.slice(0, 3));
  const month = dateText.slice(3, 5);
  const day = dateText.slice(5, 7);
  if (!Number.isFinite(rocYear)) {
    return dateText;
  }
  return `${rocYear + 1911}-${month}-${day}`;
}

function formatChange(changeValue, baseValue = null) {
  if (!Number.isFinite(changeValue)) {
    return "--";
  }
  const arrow = changeValue > 0 ? "▲" : changeValue < 0 ? "▼" : "■";
  const sign = changeValue > 0 ? "+" : "";
  const pointText = `${sign}${formatNumber(changeValue, 2)}`;

  if (!Number.isFinite(baseValue) || baseValue === 0) {
    return `${arrow} ${pointText}`;
  }

  const pct = (changeValue / baseValue) * 100;
  const pctSign = pct > 0 ? "+" : "";
  return `${arrow} ${pointText} / ${pctSign}${pct.toFixed(2)}%`;
}

function formatIndexLine(label, value, changeText, marketEmoji, changeValue) {
  const alignedLabels = {
    "S&P 500": "S&P500",
    "Dow Jones": "DowJones",
    "Nasdaq 100": "Nasdaq100",
    日經225: "Nikkei225",
    上證指數: "SSE",
    台指夜盤: "TW-Night",
    加權指數: "TAIEX",
  };
  const safeLabel = (alignedLabels[label] || label).padEnd(10, " ");
  const safeValue = String(value).padStart(9, " ");
  const trendMark =
    Number.isFinite(changeValue) && changeValue > 0
      ? "🔴"
      : Number.isFinite(changeValue) && changeValue < 0
        ? "🟢"
        : "🟡";
  return `${marketEmoji} ${safeLabel} ${safeValue}  ${trendMark} ${changeText}`;
}

function truncateTitle(title, maxLength = 58) {
  if (title.length <= maxLength) {
    return title;
  }
  return `${title.slice(0, maxLength - 1)}…`;
}

function parseRssItems(xml, maxItems = INTERNATIONAL_ITEMS) {
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  const titleRegex = /<title>([\s\S]*?)<\/title>/i;
  const linkRegex = /<link>([\s\S]*?)<\/link>/i;
  const items = [];

  const itemMatches = xml.match(itemRegex) || [];
  for (const item of itemMatches) {
    const titleMatch = item.match(titleRegex);
    if (!titleMatch) {
      continue;
    }

    const title = sanitizeText(titleMatch[1]);
    const linkMatch = item.match(linkRegex);
    const link = sanitizeUrl(sanitizeText(linkMatch?.[1] || ""));
    if (title) {
      items.push({ title, link });
    }
    if (items.length >= maxItems) {
      break;
    }
  }

  return items;
}

async function fetchRssItems(
  url,
  maxItems = INTERNATIONAL_ITEMS,
  retryCount = 0,
) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      responseType: "text",
      headers: {
        "User-Agent": "discord-reminder-bot/1.0",
      },
    });

    return parseRssItems(response.data, maxItems);
  } catch (error) {
    console.error(
      `[Stock Reminder] RSS 讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${url} - ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchRssItems(url, maxItems, retryCount + 1);
    }

    return [];
  }
}

async function fetchCategoryDigest(
  urls = [],
  fallbackItems = [],
  maxItems = INTERNATIONAL_ITEMS,
) {
  const items = [];
  const seenTitles = new Set();

  for (const url of urls) {
    const rssItems = await fetchRssItems(url, maxItems);
    for (const rssItem of rssItems) {
      if (seenTitles.has(rssItem.title)) {
        continue;
      }
      seenTitles.add(rssItem.title);
      const resolvedLink = await resolveNewsLink(rssItem.link);
      items.push({
        title: rssItem.title,
        link: resolvedLink || rssItem.link,
      });
      if (items.length >= maxItems) {
        return items;
      }
    }
  }

  return items.length > 0 ? items : fallbackItems;
}

async function resolveNewsLink(link, retryCount = 0) {
  if (!link) {
    return null;
  }

  try {
    const response = await axios.get(link, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const finalUrl = response?.request?.res?.responseUrl;
    if (finalUrl && /^https?:\/\//.test(finalUrl)) {
      return finalUrl;
    }
    return link;
  } catch (error) {
    if (retryCount < 1) {
      return resolveNewsLink(link, retryCount + 1);
    }
    return link;
  }
}

function parseStooqCsvLine(csvText) {
  const lines = (csvText || "").trim().split("\n");
  const line = lines[1] || lines[0] || "";
  if (!line) {
    return null;
  }

  const parts = line.split(",");
  if (parts.length < 7 || parts[1] === "N/D" || parts[6] === "N/D") {
    return null;
  }

  const open = parseNumber(parts[3]);
  const close = parseNumber(parts[6]);
  if (!Number.isFinite(close)) {
    return null;
  }

  return {
    date: parts[1],
    open: Number.isFinite(open) ? open : null,
    close: close,
  };
}

async function fetchStooqIndex(symbol, label, marketEmoji, retryCount = 0) {
  try {
    const response = await axios.get(
      `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
      {
        timeout: 10000,
        responseType: "text",
        headers: {
          "User-Agent": "discord-reminder-bot/1.0",
        },
      },
    );

    const parsed = parseStooqCsvLine(response.data);
    if (!parsed) {
      return null;
    }

    const change = Number.isFinite(parsed.open)
      ? parsed.close - parsed.open
      : null;
    const base = Number.isFinite(parsed.open) ? parsed.open : null;
    const changeText = formatChange(change, base);

    return formatIndexLine(
      label,
      formatNumber(parsed.close, 2),
      changeText,
      marketEmoji,
      change,
    );
  } catch (error) {
    console.error(
      `[Stock Reminder] 指數讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${label} - ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchStooqIndex(symbol, label, marketEmoji, retryCount + 1);
    }

    return null;
  }
}

function parseSinaQuoteLine(raw, symbol) {
  const regex = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)";`);
  const match = raw.match(regex);
  if (!match || !match[1]) {
    return null;
  }

  const fields = match[1].split(",");
  if (fields.length < 4) {
    return null;
  }

  const close = parseNumber(fields[1]);
  const change = parseNumber(fields[2]);
  const pct = parseNumber(fields[3]);
  if (!Number.isFinite(close)) {
    return null;
  }
  return { close, change, pct };
}

function parseSinaFuturesQuoteLine(raw, symbol) {
  const regex = new RegExp(`var\\s+hq_str_${symbol}="([^"]*)";`);
  const match = raw.match(regex);
  if (!match || !match[1]) {
    return null;
  }

  const fields = match[1].split(",");
  if (fields.length < 4) {
    return null;
  }

  const close = parseNumber(fields[0]);
  const prevClose = parseNumber(fields[3]);
  if (!Number.isFinite(close)) {
    return null;
  }
  const change = Number.isFinite(prevClose) ? close - prevClose : null;
  return { close, change, prevClose };
}

async function fetchSinaIndex(symbol, label, marketEmoji, retryCount = 0) {
  try {
    const response = await axios.get(`https://hq.sinajs.cn/list=${symbol}`, {
      timeout: 10000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const rawText = Buffer.from(response.data).toString("latin1");
    const parsed = parseSinaQuoteLine(rawText, symbol);
    if (!parsed) {
      return null;
    }

    const base = Number.isFinite(parsed.change)
      ? parsed.close - parsed.change
      : null;
    let changeText = formatChange(parsed.change, base);
    if (Number.isFinite(parsed.pct)) {
      const pctSign = parsed.pct > 0 ? "+" : "";
      changeText = `${changeText.split("/")[0].trim()} / ${pctSign}${parsed.pct.toFixed(2)}%`;
    }

    return formatIndexLine(
      label,
      formatNumber(parsed.close, 2),
      changeText,
      marketEmoji,
      parsed.change,
    );
  } catch (error) {
    console.error(
      `[Stock Reminder] 新浪指數讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${label} - ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchSinaIndex(symbol, label, marketEmoji, retryCount + 1);
    }

    return null;
  }
}

async function fetchNikkeiIndex(retryCount = 0) {
  try {
    const response = await axios.get("https://hq.sinajs.cn/list=hf_NK", {
      timeout: 10000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const rawText = Buffer.from(response.data).toString("latin1");
    const parsed = parseSinaFuturesQuoteLine(rawText, "hf_NK");
    if (!parsed) {
      return null;
    }

    const changeText = formatChange(parsed.change, parsed.prevClose);
    return formatIndexLine(
      "日經225",
      formatNumber(parsed.close, 2),
      changeText,
      "🇯🇵",
      parsed.change,
    );
  } catch (error) {
    console.error(
      `[Stock Reminder] 日經指數讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchNikkeiIndex(retryCount + 1);
    }

    return null;
  }
}

async function fetchHeadlineIndices() {
  const usPromises = US_INDEX_SYMBOLS.map((index) =>
    fetchStooqIndex(index.symbol, index.label, index.marketEmoji),
  );

  const [spx, dji, ndq, nikkei, shanghai] = await Promise.all([
    ...usPromises,
    fetchNikkeiIndex(),
    fetchSinaIndex("s_sh000001", "上證指數", "🇨🇳"),
  ]);

  const lines = [spx, dji, ndq, nikkei, shanghai].filter(Boolean);
  return lines.length > 0 ? lines : FALLBACK_DIGEST.indices;
}

function pickNearestTxNightContract(rows, latestDate) {
  const candidates = rows
    .filter(
      (row) =>
        row.Contract === "TX" &&
        row.TradingSession === "盤後" &&
        row.Date === latestDate &&
        /^\d{6}$/.test(row["ContractMonth(Week)"]) &&
        row.Last !== "-" &&
        row.Last !== "NULL",
    )
    .sort(
      (a, b) =>
        Number(a["ContractMonth(Week)"]) - Number(b["ContractMonth(Week)"]),
    );

  return candidates[0] || null;
}

async function fetchTaiwanNightIndex(retryCount = 0) {
  try {
    const response = await axios.get(
      "https://openapi.taifex.com.tw/v1/DailyMarketReportFut",
      {
        timeout: 12000,
        headers: {
          "User-Agent": "discord-reminder-bot/1.0",
        },
      },
    );

    const rows = Array.isArray(response.data) ? response.data : [];
    if (rows.length === 0) {
      return ["⚪ 🇹🇼 **台指夜盤**：N/A（--）"];
    }

    const latestDate = rows
      .map((row) => row.Date)
      .filter(Boolean)
      .sort()
      .pop();

    if (!latestDate) {
      return ["⚪ 🇹🇼 **台指夜盤**：N/A（--）"];
    }

    const contract = pickNearestTxNightContract(rows, latestDate);
    if (!contract) {
      return ["⚪ 🇹🇼 **台指夜盤**：N/A（--）"];
    }

    const lastValue = parseNumber(contract.Last);
    if (!Number.isFinite(lastValue)) {
      return ["⚪ 🇹🇼 **台指夜盤**：N/A（--）"];
    }

    const change = parseNumber(contract.Change);
    const open = parseNumber(contract.Open);
    const changeText = formatChange(
      change,
      Number.isFinite(open) ? open : null,
    );

    return [
      formatIndexLine(
        "台指夜盤",
        formatNumber(lastValue, 0),
        changeText,
        "🇹🇼",
        change,
      ),
    ];
  } catch (error) {
    console.error(
      `[Stock Reminder] 台指夜盤讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchTaiwanNightIndex(retryCount + 1);
    }

    return ["⚪ 🇹🇼 **台指夜盤**：N/A（--）"];
  }
}

async function fetchTaiwanPreviousClose(retryCount = 0) {
  try {
    const response = await axios.get(
      "https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX",
      {
        timeout: 12000,
        headers: {
          "User-Agent": "discord-reminder-bot/1.0",
        },
      },
    );

    const rows = Array.isArray(response.data) ? response.data : [];
    const weighted = rows.find((row) => row["指數"] === "發行量加權股價指數");
    if (!weighted) {
      return {
        line: FALLBACK_DIGEST.twClose,
        date: "N/A",
      };
    }

    const close = parseNumber(weighted["收盤指數"]);
    const changePoint = parseNumber(weighted["漲跌點數"]);
    const sign = weighted["漲跌"] === "-" ? -1 : 1;
    const signedChange = Number.isFinite(changePoint)
      ? changePoint * sign
      : null;
    const prevClose =
      Number.isFinite(close) && Number.isFinite(signedChange)
        ? close - signedChange
        : null;

    return {
      line: formatIndexLine(
        "加權指數",
        formatNumber(close, 2),
        formatChange(signedChange, prevClose),
        "🇹🇼",
        signedChange,
      ),
      date: toRocDateString(weighted["日期"]),
    };
  } catch (error) {
    console.error(
      `[Stock Reminder] 台股收盤讀取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}): ${error.message}`,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchTaiwanPreviousClose(retryCount + 1);
    }

    return {
      line: FALLBACK_DIGEST.twClose,
      date: "N/A",
    };
  }
}

async function fetchFinanceDigest() {
  const [international, headlineIndices, twNightIndex, twPreviousClose] =
    await Promise.all([
      fetchCategoryDigest(
        FINANCE_FEEDS.international,
        FALLBACK_DIGEST.international,
        INTERNATIONAL_ITEMS,
      ),
      fetchHeadlineIndices(),
      fetchTaiwanNightIndex(),
      fetchTaiwanPreviousClose(),
    ]);

  return { international, headlineIndices, twNightIndex, twPreviousClose };
}

function shortenNewsLink(link) {
  if (!link) {
    return link;
  }
  try {
    const url = new URL(link);
    url.searchParams.delete("oc");
    url.hash = "";
    return url.toString();
  } catch {
    return link;
  }
}

function createInternationalNewsFields(items) {
  const normalizedItems = items.slice(0, INTERNATIONAL_ITEMS);

  if (normalizedItems.length === 0) {
    return [
      {
        name: "🌍 國際時事",
        value: "• 暫無即時摘要，請留意主要央行與地緣政治消息。",
        inline: false,
      },
    ];
  }

  return normalizedItems.map((item, index) => {
    const shortLink = item.link ? shortenNewsLink(item.link) : null;
    const title = truncateTitle(item.title, shortLink ? 72 : 90);
    const value = shortLink ? `${title}（[原文](${shortLink})）` : title;

    return {
      name: index === 0 ? "🌍 國際時事" : "↳",
      value: value.slice(0, 1024),
      inline: false,
    };
  });
}

function buildStockReminderEmbed(digest, timezone) {
  const currentTime = moment().tz(timezone).format("YYYY-MM-DD HH:mm z");
  const newsFields = createInternationalNewsFields(digest.international);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("📈 早晨財經提醒")
    .addFields(
      ...newsFields,
      {
        name: "📊 指數焦點",
        value: [
          "```",
          ...digest.headlineIndices,
          ...digest.twNightIndex,
          "```",
        ].join("\n"),
      },
      {
        name: `🧾 前一交易日台股收盤（${digest.twPreviousClose.date}）`,
        value: ["```", digest.twPreviousClose.line, "```"].join("\n"),
      },
    );

  embed
    .setFooter({
      text: `來源: 公開新聞 RSS / Stooq / 新浪 / TWSE / TAIFEX • ${currentTime}`,
    })
    .setTimestamp();

  return embed;
}

function buildStockWordPager(page) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${STOCK_WORD_PAGE_PREFIX}${STOCK_PAGE}`)
        .setLabel("股市")
        .setStyle(
          page === STOCK_PAGE ? ButtonStyle.Success : ButtonStyle.Secondary,
        )
        .setDisabled(page === STOCK_PAGE),
      new ButtonBuilder()
        .setCustomId(`${STOCK_WORD_PAGE_PREFIX}${WORD_PAGE}`)
        .setLabel("單字")
        .setStyle(
          page === WORD_PAGE ? ButtonStyle.Primary : ButtonStyle.Secondary,
        )
        .setDisabled(page === WORD_PAGE),
    ),
  ];
}

function cleanupStockWordStore() {
  const now = Date.now();
  for (const [messageId, value] of stockWordPageStore.entries()) {
    if (now - value.createdAt > STOCK_WORD_PAGE_TTL_MS) {
      stockWordPageStore.delete(messageId);
    }
  }
}

function saveStockWordPages(messageId, stockEmbed, wordEmbed) {
  cleanupStockWordStore();
  stockWordPageStore.set(messageId, {
    createdAt: Date.now(),
    pages: {
      [STOCK_PAGE]: stockEmbed.toJSON(),
      [WORD_PAGE]: wordEmbed.toJSON(),
    },
  });
}

function isStockWordPageButton(customId) {
  return (
    typeof customId === "string" && customId.startsWith(STOCK_WORD_PAGE_PREFIX)
  );
}

function getStockWordPageFromCustomId(customId) {
  if (!isStockWordPageButton(customId)) {
    return null;
  }
  const page = customId.slice(STOCK_WORD_PAGE_PREFIX.length);
  return page === STOCK_PAGE || page === WORD_PAGE ? page : null;
}

function getStockWordPageResponse(messageId, page) {
  const entry = stockWordPageStore.get(messageId);
  if (!entry || !entry.pages?.[page]) {
    return null;
  }
  return {
    embeds: [EmbedBuilder.from(entry.pages[page])],
    components: buildStockWordPager(page),
  };
}

async function sendStockReminder(
  client,
  guildId,
  channelId,
  config,
  isTest = false,
) {
  try {
    console.log(
      `[Stock Reminder] 開始為伺服器 ${guildId} 發送${isTest ? "測試" : ""}財經提醒...`,
    );

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error("找不到頻道");
    }

    const digest = await fetchFinanceDigest();
    const timezone = config.timezone || DEFAULT_TIMEZONE;
    const stockEmbed = buildStockReminderEmbed(digest, timezone);

    const wordConfig = dailyWord.getGuildWordConfig(guildId);
    const mergedWordConfig = {
      ...wordConfig,
      timezone,
    };
    const { wordData, embed: wordEmbed } =
      await dailyWord.generateDailyWordPayload(guildId, mergedWordConfig);

    let content = "";
    if (config.mentionUserId && !isTest) {
      content = `<@${config.mentionUserId}>`;
    }

    const message = await channel.send({
      content: content || undefined,
      embeds: [stockEmbed],
      components: buildStockWordPager(STOCK_PAGE),
    });

    saveStockWordPages(message.id, stockEmbed, wordEmbed);
    dailyWord.recordDailyWordDelivery(
      guildId,
      mergedWordConfig,
      wordData,
      message.id,
      isTest,
    );

    if (!isTest) {
      updateGuildStockConfig(guildId, {
        lastSentDate: moment().tz(timezone).format("YYYY-MM-DD"),
        totalSent: (config.totalSent || 0) + 1,
        lastMessageId: message.id,
      });
    }

    console.log("[Stock Reminder] ✅ 發送成功");
    return { success: true, messageId: message.id };
  } catch (error) {
    console.error("[Stock Reminder] ❌ 發送失敗:", error);
    return { success: false, error: error.message };
  }
}

async function checkStockReminderSchedules(client) {
  try {
    const config = loadStockConfig();

    for (const [guildId, guildConfig] of Object.entries(config.guilds)) {
      if (
        !guildConfig.enabled ||
        !guildConfig.channelId ||
        !guildConfig.sendTime
      ) {
        continue;
      }

      const timezone = guildConfig.timezone || DEFAULT_TIMEZONE;
      const now = moment().tz(timezone);
      const currentTime = now.format("HH:mm");
      const currentDate = now.format("YYYY-MM-DD");

      if (currentTime !== guildConfig.sendTime) {
        continue;
      }

      if (guildConfig.lastSentDate === currentDate) {
        continue;
      }

      await sendStockReminder(
        client,
        guildId,
        guildConfig.channelId,
        guildConfig,
        false,
      );
    }
  } catch (error) {
    console.error("[Stock Reminder] 定時檢查錯誤:", error);
  }
}

module.exports = {
  getGuildStockConfig,
  updateGuildStockConfig,
  isStockWordPageButton,
  getStockWordPageFromCustomId,
  getStockWordPageResponse,
  sendStockReminder,
  checkStockReminderSchedules,
};
