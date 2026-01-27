const JishoAPI = require('unofficial-jisho-api');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// ==================== 常量定義 ====================

// 支援 Docker volume 掛載
const DATA_DIR = process.env.DATA_DIR || __dirname;
const WORD_CONFIG_FILE = path.join(DATA_DIR, 'word-config.json');
const WORD_HISTORY_FILE = path.join(DATA_DIR, 'word-history.json');
const MAX_HISTORY_SIZE = 500;
const MAX_RETRY = 3;
const RETRY_DELAY = 2000; // 2 秒
const EMBED_COLOR = '#FF6B81'; // 粉紅色
const jisho = new JishoAPI();

// ==================== 配置管理 ====================

// 讀取單字配置
function loadWordConfig() {
    if (fs.existsSync(WORD_CONFIG_FILE)) {
        const data = fs.readFileSync(WORD_CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    }
    return { version: '1.0', guilds: {} };
}

// 保存單字配置
function saveWordConfig(config) {
    fs.writeFileSync(WORD_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 讀取單字歷史
function loadWordHistory() {
    if (fs.existsSync(WORD_HISTORY_FILE)) {
        const data = fs.readFileSync(WORD_HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    }
    return { version: '1.0', guilds: {} };
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
            sendTime: '09:00',
            jlptLevel: 'all',
            mentionUserId: null,
            timezone: 'Asia/Taipei',
            lastSentDate: null,
            totalSent: 0,
            lastMessageId: null
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
            sendTime: '09:00',
            jlptLevel: 'all',
            mentionUserId: null,
            timezone: 'Asia/Taipei',
            lastSentDate: null,
            totalSent: 0,
            lastMessageId: null
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
        messageId: wordData.messageId || null
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
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 從 Jisho API 獲取隨機單字
async function fetchRandomWord(jlptLevel = 'all', excludeWords = [], retryCount = 0) {
    try {
        // 構建搜尋查詢
        let searchQuery = '#common';
        
        // 添加 JLPT 等級過濾
        if (jlptLevel !== 'all') {
            searchQuery += ` #jlpt-${jlptLevel}`;
        }
        
        console.log(`[Daily Word] 搜尋單字: ${searchQuery}`);
        
        // 搜尋單字
        const result = await jisho.searchForPhrase(searchQuery);
        
        if (!result.data || result.data.length === 0) {
            throw new Error('未找到任何單字');
        }
        
        // 過濾常用單字
        let words = result.data.filter(w => w.is_common);
        
        // 如果沒有常用單字，使用所有結果
        if (words.length === 0) {
            words = result.data;
        }
        
        // 過濾已發送的單字
        if (excludeWords.length > 0) {
            words = words.filter(w => {
                const wordText = w.japanese[0]?.word || w.japanese[0]?.reading;
                return !excludeWords.includes(wordText);
            });
        }
        
        // 如果過濾後沒有單字了，清空排除列表重試
        if (words.length === 0 && excludeWords.length > 0) {
            console.log('[Daily Word] 所有單字都已發送過，清空歷史重新開始');
            return fetchRandomWord(jlptLevel, [], 0);
        }
        
        // 隨機選擇一個單字
        const randomIndex = Math.floor(Math.random() * words.length);
        const selectedWord = words[randomIndex];
        
        // 提取單字資訊
        const wordData = {
            word: selectedWord.japanese[0]?.word || selectedWord.japanese[0]?.reading,
            reading: selectedWord.japanese[0]?.reading || '',
            meanings: selectedWord.senses[0]?.english_definitions || [],
            partsOfSpeech: selectedWord.senses[0]?.parts_of_speech || [],
            jlptLevel: selectedWord.jlpt[0] || 'N/A',
            isCommon: selectedWord.is_common
        };
        
        console.log(`[Daily Word] 選擇單字: ${wordData.word} (${wordData.reading})`);
        
        return wordData;
        
    } catch (error) {
        console.error(`[Daily Word] API 請求失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}):`, error.message);
        
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
            romaji: example.kana || '',
            english: example.english || ''
        };
        
    } catch (error) {
        console.error(`[Daily Word] 例句獲取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}):`, error.message);
        
        if (retryCount < MAX_RETRY - 1) {
            await delay(RETRY_DELAY);
            return fetchExampleSentences(word, retryCount + 1);
        }
        
        return null; // 例句失敗不影響主功能
    }
}

// 從 Unsplash 獲取圖片
async function fetchUnsplashImage(query, retryCount = 0) {
    try {
        const accessKey = process.env.UNSPLASH_ACCESS_KEY;
        
        if (!accessKey) {
            console.log('[Daily Word] 未設置 UNSPLASH_ACCESS_KEY，跳過圖片');
            return null;
        }
        
        console.log(`[Daily Word] 搜尋圖片: ${query}`);
        
        const response = await axios.get('https://api.unsplash.com/photos/random', {
            params: {
                query: query,
                orientation: 'landscape'
            },
            headers: {
                'Authorization': `Client-ID ${accessKey}`
            },
            timeout: 10000
        });
        
        if (response.data && response.data.urls) {
            return {
                url: response.data.urls.regular,
                photographer: response.data.user.name,
                photographerUrl: response.data.user.links.html
            };
        }
        
        return null;
        
    } catch (error) {
        console.error(`[Daily Word] 圖片獲取失敗 (嘗試 ${retryCount + 1}/${MAX_RETRY}):`, error.message);
        
        if (retryCount < MAX_RETRY - 1) {
            await delay(RETRY_DELAY);
            return fetchUnsplashImage(query, retryCount + 1);
        }
        
        return null; // 圖片失敗不影響主功能
    }
}

// ==================== 單字卡片創建 ====================

function createWordEmbed(wordData, exampleData, imageData, timezone) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('📚 今日の単語')
        .setDescription(`**${wordData.word}** ${wordData.reading ? `(${wordData.reading})` : ''}`);
    
    // 添加意思
    if (wordData.meanings && wordData.meanings.length > 0) {
        embed.addFields({
            name: '📖 Meaning',
            value: wordData.meanings.map(m => `• ${m}`).join('\n')
        });
    }
    
    // 添加詞性和 JLPT 等級（並排）
    const typeValue = wordData.partsOfSpeech.length > 0 
        ? wordData.partsOfSpeech.join(', ') 
        : 'N/A';
    
    embed.addFields(
        { name: '🏷️ Type', value: typeValue, inline: true },
        { name: '📊 JLPT', value: wordData.jlptLevel, inline: true }
    );
    
    // 添加例句
    if (exampleData) {
        const exampleText = `${exampleData.japanese}\n${exampleData.romaji}\n→ ${exampleData.english}`;
        embed.addFields({
            name: '📝 Example',
            value: exampleText
        });
    }
    
    // 添加圖片
    if (imageData) {
        embed.setImage(imageData.url);
        embed.setThumbnail(imageData.url);
    }
    
    // 添加底部資訊
    const currentTime = moment().tz(timezone).format('YYYY-MM-DD HH:mm z');
    let footerText = currentTime;
    
    if (imageData) {
        footerText = `📷 Photo by ${imageData.photographer} on Unsplash • ${currentTime}`;
    }
    
    embed.setFooter({ text: footerText });
    embed.setTimestamp();
    
    return embed;
}

// ==================== 發送單字 ====================

async function sendDailyWord(client, guildId, channelId, config, isTest = false) {
    try {
        console.log(`[Daily Word] 開始為伺服器 ${guildId} 發送${isTest ? '測試' : ''}單字...`);
        
        // 獲取頻道
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('找不到頻道');
        }
        
        // 獲取已發送的單字列表
        const history = getGuildWordHistory(guildId);
        const excludeWords = history.map(h => h.word);
        
        // 獲取隨機單字
        const wordData = await fetchRandomWord(config.jlptLevel, excludeWords);
        
        // 獲取例句
        const exampleData = await fetchExampleSentences(wordData.word);
        
        // 獲取圖片（使用英文翻譯作為搜尋關鍵字）
        let imageData = null;
        if (wordData.meanings && wordData.meanings.length > 0) {
            const searchTerm = wordData.meanings[0].split(' ')[0]; // 取第一個單詞
            imageData = await fetchUnsplashImage(searchTerm);
            
            // 如果失敗，使用備用關鍵字 "japan"
            if (!imageData) {
                imageData = await fetchUnsplashImage('japan');
            }
        }
        
        // 創建 Embed
        const embed = createWordEmbed(wordData, exampleData, imageData, config.timezone);
        
        // 發送訊息
        let content = '';
        if (config.mentionUserId && !isTest) {
            content = `<@${config.mentionUserId}>`;
        }
        
        const message = await channel.send({
            content: content || undefined,
            embeds: [embed]
        });
        
        // 添加到歷史記錄
        addToWordHistory(guildId, {
            word: wordData.word,
            reading: wordData.reading,
            messageId: message.id
        });
        
        // 更新配置
        if (!isTest) {
            updateGuildWordConfig(guildId, {
                lastSentDate: moment().tz(config.timezone).format('YYYY-MM-DD'),
                totalSent: (config.totalSent || 0) + 1,
                lastMessageId: message.id
            });
        }
        
        console.log(`[Daily Word] ✅ 成功發送單字: ${wordData.word}`);
        
        return {
            success: true,
            wordData: wordData,
            messageId: message.id
        };
        
    } catch (error) {
        console.error(`[Daily Word] ❌ 發送失敗:`, error);
        return {
            success: false,
            error: error.message
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
            const timezone = guildConfig.timezone || 'Asia/Taipei';
            const now = moment().tz(timezone);
            const currentTime = now.format('HH:mm');
            const currentDate = now.format('YYYY-MM-DD');
            
            // 檢查是否到了發送時間
            if (currentTime === guildConfig.sendTime) {
                // 檢查今天是否已經發送過
                if (guildConfig.lastSentDate === currentDate) {
                    continue; // 今天已經發送過了
                }
                
                console.log(`[Daily Word] 到了發送時間！伺服器: ${guildId}, 時間: ${currentTime}`);
                
                // 發送單字
                await sendDailyWord(client, guildId, guildConfig.channelId, guildConfig, false);
            }
        }
        
    } catch (error) {
        console.error('[Daily Word] 定時檢查錯誤:', error);
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
    
    // 定時檢查
    checkDailyWordSchedules
};
