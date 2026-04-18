const JishoAPI = require("unofficial-jisho-api");
const { EmbedBuilder } = require("discord.js");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");

// ==================== 常量定義 ====================

// 支援 Docker volume 掛載
const DATA_DIR = process.env.DATA_DIR || __dirname;
const WORD_CONFIG_FILE = path.join(DATA_DIR, "word-config.json");
const WORD_HISTORY_FILE = path.join(DATA_DIR, "word-history.json");
const MAX_HISTORY_SIZE = 500;
const MAX_RETRY = 3;
const RETRY_DELAY = 2000; // 2 秒
const EMBED_COLOR = "#FF6B81"; // 粉紅色
const jisho = new JishoAPI();
const CHALLENGING_LEVELS = new Set(["n1", "n2", "n3"]);
const JLPT_DIFFICULTY_RANK = {
  n1: 1,
  n2: 2,
  n3: 3,
  n4: 4,
  n5: 5,
};

function loadJsonWithDefault(filePath, defaultFactory) {
  if (!fs.existsSync(filePath)) {
    return defaultFactory();
  }

  const data = fs.readFileSync(filePath, "utf8").trim();
  if (!data) {
    const defaultValue = defaultFactory();
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${error.message}. Please fix the file content.`,
    );
  }
}

function normalizeJlptTags(jlptTags = []) {
  return jlptTags
    .map((tag) => tag.toLowerCase().replace("jlpt-", "").trim())
    .filter((tag) => JLPT_DIFFICULTY_RANK[tag]);
}

function isChallengingLevel(level) {
  return CHALLENGING_LEVELS.has(level);
}

function isAdvancedWordCandidate(word, targetLevel) {
  const tags = normalizeJlptTags(word.jlpt || []);
  if (tags.length === 0 || !tags.includes(targetLevel)) {
    return false;
  }

  // 只保留「目標等級或更難」的標籤，避免 N1-N3 混入 N4/N5 偏簡單詞
  const onlyTargetOrHarder = tags.every(
    (tag) => JLPT_DIFFICULTY_RANK[tag] <= JLPT_DIFFICULTY_RANK[targetLevel],
  );

  if (!onlyTargetOrHarder) {
    return false;
  }

  // N1-N3 優先使用有漢字寫法的詞，降低過於基礎的純假名詞比例
  return Boolean(word.japanese?.[0]?.word);
}

// ==================== 配置管理 ====================

// 讀取單字配置
function loadWordConfig() {
  return loadJsonWithDefault(WORD_CONFIG_FILE, () => ({ version: "1.0", guilds: {} }));
}

// 保存單字配置
function saveWordConfig(config) {
  fs.writeFileSync(WORD_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 讀取單字歷史
function loadWordHistory() {
  return loadJsonWithDefault(WORD_HISTORY_FILE, () => ({ version: "1.0", guilds: {} }));
}

// 保存單字歷史
function saveWordHistory(history) {
  fs.writeFileSync(WORD_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// 獲取伺服器單字配置
function getGuildWordConfig(guildId) {
  const config = loadWordConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      enabled: false,
      channelId: null,
      sendTime: "09:00",
      jlptLevel: "all",
      mentionUserId: null,
      timezone: "Asia/Taipei",
      lastSentDate: null,
      totalSent: 0,
      lastMessageId: null,
    };
    saveWordConfig(config);
  }
  return config.guilds[guildId];
}

// 更新伺服器單字配置
function updateGuildWordConfig(guildId, updates) {
  const config = loadWordConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      enabled: false,
      channelId: null,
      sendTime: "09:00",
      jlptLevel: "all",
      mentionUserId: null,
      timezone: "Asia/Taipei",
      lastSentDate: null,
      totalSent: 0,
      lastMessageId: null,
    };
  }
  Object.assign(config.guilds[guildId], updates);
  saveWordConfig(config);
}

// 獲取伺服器單字歷史
function getGuildWordHistory(guildId) {
  const history = loadWordHistory();
  if (!history.guilds[guildId]) {
    history.guilds[guildId] = [];
    saveWordHistory(history);
  }
  return history.guilds[guildId];
}

// 添加單字到歷史記錄
function addToWordHistory(guildId, wordData) {
  const history = loadWordHistory();
  if (!history.guilds[guildId]) {
    history.guilds[guildId] = [];
  }

  // 添加新記錄
  history.guilds[guildId].push({
    word: wordData.word,
    reading: wordData.reading,
    sentAt: moment().toISOString(),
    messageId: wordData.messageId || null,
  });

  // 如果超過最大數量，刪除最舊的
  if (history.guilds[guildId].length > MAX_HISTORY_SIZE) {
    history.guilds[guildId].shift();
  }

  saveWordHistory(history);
}

// 清空伺服器歷史記錄
function clearGuildWordHistory(guildId) {
  const history = loadWordHistory();
  history.guilds[guildId] = [];
  saveWordHistory(history);
}

// ==================== API 請求函數 ====================

// 延遲函數
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 從 Jisho API 獲取隨機單字
async function fetchRandomWord(
  jlptLevel = "all",
  excludeWords = [],
  retryCount = 0,
) {
  try {
    const normalizedLevel = (jlptLevel || "all").toLowerCase();
    const useChallengingFilter = isChallengingLevel(normalizedLevel);

    // 構建搜尋查詢
    let searchQuery = "#common";

    // 添加 JLPT 等級過濾
    if (normalizedLevel !== "all") {
      searchQuery = useChallengingFilter
        ? `#jlpt-${normalizedLevel}`
        : `${searchQuery} #jlpt-${normalizedLevel}`;
    }

    console.log(`[Daily Word] 搜尋單字: ${searchQuery}`);

    // 搜尋單字
    const result = await jisho.searchForPhrase(searchQuery);

    if (!result.data || result.data.length === 0) {
      throw new Error("未找到任何單字");
    }

    let words = result.data;

    // N4/N5/全部優先常用詞；N1-N3 不使用 common 偏好，避免過於基礎
    if (!useChallengingFilter) {
      words = result.data.filter((w) => w.is_common);

      if (words.length === 0) {
        words = result.data;
      }
    } else {
      const advancedWords = words.filter((w) =>
        isAdvancedWordCandidate(w, normalizedLevel),
      );

      if (advancedWords.length > 0) {
        words = advancedWords;
      } else {
        // 若條件過嚴，退回僅限目標等級，避免沒有可用單字
        console.log("[Daily Word] 進階過濾後無結果，退回 JLPT 等級過濾");
        words = words.filter((w) =>
          normalizeJlptTags(w.jlpt || []).includes(normalizedLevel),
        );
      }
    }

    // 過濾已發送的單字
    if (excludeWords.length > 0) {
      words = words.filter((w) => {
        const wordText = w.japanese[0]?.word || w.japanese[0]?.reading;
        return !excludeWords.includes(wordText);
      });
    }

    // 如果過濾後沒有單字了，清空排除列表重試
    if (words.length === 0 && excludeWords.length > 0) {
      console.log("[Daily Word] 所有單字都已發送過，清空歷史重新開始");
      return fetchRandomWord(jlptLevel, [], 0);
    }

    // 隨機選擇一個單字
    const randomIndex = Math.floor(Math.random() * words.length);
    const selectedWord = words[randomIndex];

    // 提取單字資訊
    const jlptTags = normalizeJlptTags(selectedWord.jlpt || []);
    const wordData = {
      word: selectedWord.japanese[0]?.word || selectedWord.japanese[0]?.reading,
      reading: selectedWord.japanese[0]?.reading || "",
      meanings: selectedWord.senses[0]?.english_definitions || [],
      partsOfSpeech: selectedWord.senses[0]?.parts_of_speech || [],
      jlptLevel:
        jlptTags.length > 0
          ? jlptTags.map((tag) => tag.toUpperCase()).join(", ")
          : "N/A",
      isCommon: selectedWord.is_common,
    };

    console.log(
      `[Daily Word] 選擇單字: ${wordData.word} (${wordData.reading})`,
    );

    return wordData;
  } catch (error) {
    console.error(
      `[Daily Word] API 請求失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}):`,
      error.message,
    );

    if (retryCount < MAX_RETRY - 1) {
      console.log(`[Daily Word] ${RETRY_DELAY / 1000} 秒後重試...`);
      await delay(RETRY_DELAY);
      return fetchRandomWord(jlptLevel, excludeWords, retryCount + 1);
    }

    throw error;
  }
}

// 獲取例句
async function fetchExampleSentences(word, retryCount = 0) {
  try {
    console.log(`[Daily Word] 搜尋例句: ${word}`);

    const result = await jisho.searchForExamples(word);

    if (!result.results || result.results.length === 0) {
      return null;
    }

    // 只取第一個例句
    const example = result.results[0];

    return {
      japanese: example.kanji || example.kana,
      romaji: example.kana || "",
      english: example.english || "",
    };
  } catch (error) {
    console.error(
      `[Daily Word] 例句獲取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}):`,
      error.message,
    );

    if (retryCount < MAX_RETRY - 1) {
      await delay(RETRY_DELAY);
      return fetchExampleSentences(word, retryCount + 1);
    }

    return null; // 例句失敗不影響主功能
  }
}

// ==================== 單字卡片創建 ====================

function createWordEmbed(wordData, exampleData, timezone) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("📚 今日の単語")
    .setDescription(
      `**${wordData.word}** ${wordData.reading ? `(${wordData.reading})` : ""}`,
    );

  // 添加意思
  if (wordData.meanings && wordData.meanings.length > 0) {
    embed.addFields({
      name: "📖 Meaning",
      value: wordData.meanings.map((m) => `• ${m}`).join("\n"),
    });
  }

  // 添加詞性和 JLPT 等級（並排）
  const typeValue =
    wordData.partsOfSpeech.length > 0
      ? wordData.partsOfSpeech.join(", ")
      : "N/A";

  embed.addFields(
    { name: "🏷️ Type", value: typeValue, inline: true },
    { name: "📊 JLPT", value: wordData.jlptLevel, inline: true },
  );

  // 添加例句
  if (exampleData) {
    const exampleText = `${exampleData.japanese}\n${exampleData.romaji}\n→ ${exampleData.english}`;
    embed.addFields({
      name: "📝 Example",
      value: exampleText,
    });
  }

  // 添加底部資訊
  const currentTime = moment().tz(timezone).format("YYYY-MM-DD HH:mm z");
  embed.setFooter({ text: currentTime });
  embed.setTimestamp();

  return embed;
}

async function generateDailyWordPayload(guildId, config) {
  const history = getGuildWordHistory(guildId);
  const excludeWords = history.map((h) => h.word);
  const wordData = await fetchRandomWord(config.jlptLevel, excludeWords);
  const exampleData = await fetchExampleSentences(wordData.word);
  const embed = createWordEmbed(wordData, exampleData, config.timezone);

  return { wordData, embed };
}

function recordDailyWordDelivery(
  guildId,
  config,
  wordData,
  messageId,
  isTest = false,
) {
  addToWordHistory(guildId, {
    word: wordData.word,
    reading: wordData.reading,
    messageId,
  });

  if (!isTest) {
    updateGuildWordConfig(guildId, {
      lastSentDate: moment().tz(config.timezone).format("YYYY-MM-DD"),
      totalSent: (config.totalSent || 0) + 1,
      lastMessageId: messageId,
    });
  }
}

// ==================== 發送單字 ====================

async function sendDailyWord(
  client,
  guildId,
  channelId,
  config,
  isTest = false,
) {
  try {
    console.log(
      `[Daily Word] 開始為伺服器 ${guildId} 發送${isTest ? "測試" : ""}單字...`,
    );

    // 獲取頻道
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error("找不到頻道");
    }

    const { wordData, embed } = await generateDailyWordPayload(guildId, config);

    // 發送訊息
    let content = "";
    if (config.mentionUserId && !isTest) {
      content = `<@${config.mentionUserId}>`;
    }

    const message = await channel.send({
      content: content || undefined,
      embeds: [embed],
    });

    recordDailyWordDelivery(guildId, config, wordData, message.id, isTest);

    console.log(`[Daily Word] ✅ 成功發送單字: ${wordData.word}`);

    return {
      success: true,
      wordData: wordData,
      messageId: message.id,
    };
  } catch (error) {
    console.error(`[Daily Word] ❌ 發送失敗:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== 定時檢查 ====================

async function checkDailyWordSchedules(client) {
  try {
    const config = loadWordConfig();

    // 遍歷所有伺服器
    for (const [guildId, guildConfig] of Object.entries(config.guilds)) {
      // 跳過未啟用的伺服器
      if (!guildConfig.enabled) {
        continue;
      }

      // 檢查是否有配置
      if (!guildConfig.channelId || !guildConfig.sendTime) {
        continue;
      }

      // 獲取當前時區的時間
      const timezone = guildConfig.timezone || "Asia/Taipei";
      const now = moment().tz(timezone);
      const currentTime = now.format("HH:mm");
      const currentDate = now.format("YYYY-MM-DD");

      // 檢查是否到了發送時間
      if (currentTime === guildConfig.sendTime) {
        // 檢查今天是否已經發送過
        if (guildConfig.lastSentDate === currentDate) {
          continue; // 今天已經發送過了
        }

        console.log(
          `[Daily Word] 到了發送時間！伺服器: ${guildId}, 時間: ${currentTime}`,
        );

        // 發送單字
        await sendDailyWord(
          client,
          guildId,
          guildConfig.channelId,
          guildConfig,
          false,
        );
      }
    }
  } catch (error) {
    console.error("[Daily Word] 定時檢查錯誤:", error);
  }
}

// ==================== 導出函數 ====================

module.exports = {
  // 配置管理
  getGuildWordConfig,
  updateGuildWordConfig,

  // 歷史管理
  getGuildWordHistory,
  clearGuildWordHistory,

  // 發送單字
  sendDailyWord,
  generateDailyWordPayload,
  recordDailyWordDelivery,

  // 定時檢查
  checkDailyWordSchedules,
};
