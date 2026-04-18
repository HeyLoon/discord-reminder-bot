const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// ==================== 常量定義 ====================

// 支援 Docker volume 掛載
const DATA_DIR = process.env.DATA_DIR || __dirname;
const MONITOR_CONFIG_FILE = path.join(DATA_DIR, 'game-monitor.json');
const GRACE_PERIOD_MINUTES = 30; // 寬限期：30 分鐘
const EMBED_COLOR = '#FF6B6B'; // 警告紅色

function loadJsonWithDefault(filePath, defaultFactory) {
    if (!fs.existsSync(filePath)) {
        return defaultFactory();
    }

    const data = fs.readFileSync(filePath, 'utf8').trim();
    if (!data) {
        const defaultValue = defaultFactory();
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
    }

    try {
        return JSON.parse(data);
    } catch (error) {
        throw new Error(
            `Invalid JSON in ${filePath}: ${error.message}. Please fix the file content.`
        );
    }
}

// ==================== 配置管理 ====================

/**
 * 讀取監控配置
 * @returns {Object} 監控配置物件
 */
function loadMonitorConfig() {
    return loadJsonWithDefault(MONITOR_CONFIG_FILE, () => ({ version: '1.0', guilds: {} }));
}

/**
 * 保存監控配置
 * @param {Object} config - 監控配置物件
 */
function saveMonitorConfig(config) {
    fs.writeFileSync(MONITOR_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * 獲取伺服器的所有監控
 * @param {string} guildId - 伺服器 ID
 * @returns {Object} 監控物件 (key: userId_gameKeyword, value: monitor data)
 */
function getGuildMonitors(guildId) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) {
        config.guilds[guildId] = { monitors: {} };
        saveMonitorConfig(config);
    }
    return config.guilds[guildId].monitors;
}

/**
 * 獲取特定使用者的所有監控
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @returns {Array} 該使用者的所有監控
 */
function getUserMonitors(guildId, userId) {
    const monitors = getGuildMonitors(guildId);
    return Object.entries(monitors)
        .filter(([key, monitor]) => monitor.userId === userId)
        .map(([key, monitor]) => ({ key, ...monitor }));
}

// ==================== 監控操作 ====================

/**
 * 建立新的監控
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} gameKeyword - 遊戲關鍵字
 * @param {string} originalGameName - 原始遊戲名稱
 * @param {number} timeLimit - 時間限制（分鐘）
 * @param {string} channelId - 提醒頻道 ID
 * @param {string} createdBy - 建立者 ID
 * @returns {Object} { success: boolean, message: string }
 */
function startMonitoring(guildId, userId, gameKeyword, originalGameName, timeLimit, channelId, createdBy) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) {
        config.guilds[guildId] = { monitors: {} };
    }

    const monitorKey = `${userId}_${gameKeyword.toLowerCase()}`;
    
    // 檢查是否已存在
    if (config.guilds[guildId].monitors[monitorKey]) {
        return {
            success: false,
            message: `已存在對該使用者的 ${gameKeyword} 監控`
        };
    }

    // 建立監控資料
    config.guilds[guildId].monitors[monitorKey] = {
        userId: userId,
        gameKeyword: gameKeyword.toLowerCase(),
        originalGameName: originalGameName,
        timeLimit: timeLimit,
        channelId: channelId,
        enabled: true,
        startedAt: null,
        accumulatedTime: 0,
        lastStoppedAt: null,
        reminded: false,
        createdBy: createdBy,
        createdAt: new Date().toISOString()
    };

    saveMonitorConfig(config);

    return {
        success: true,
        message: `已建立監控`,
        monitor: config.guilds[guildId].monitors[monitorKey]
    };
}

/**
 * 刪除監控
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} gameKeyword - 遊戲關鍵字
 * @returns {Object} { success: boolean, message: string }
 */
function stopMonitoring(guildId, userId, gameKeyword) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) {
        return { success: false, message: '此伺服器沒有任何監控' };
    }

    const monitorKey = `${userId}_${gameKeyword.toLowerCase()}`;
    
    if (!config.guilds[guildId].monitors[monitorKey]) {
        return {
            success: false,
            message: `找不到關鍵字為 '${gameKeyword}' 的監控`
        };
    }

    const deletedMonitor = config.guilds[guildId].monitors[monitorKey];
    delete config.guilds[guildId].monitors[monitorKey];
    saveMonitorConfig(config);

    return {
        success: true,
        message: `已刪除對該使用者的 ${gameKeyword} 監控`,
        monitor: deletedMonitor
    };
}

/**
 * 啟用監控（可批次操作）
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string|null} gameKeyword - 遊戲關鍵字（null = 啟用所有）
 * @returns {Object} { success: boolean, count: number, message: string, monitors: Array }
 */
function enableMonitoring(guildId, userId, gameKeyword = null) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) {
        return { success: false, count: 0, message: '此伺服器沒有任何監控' };
    }

    const monitors = config.guilds[guildId].monitors;
    let enabledMonitors = [];

    if (gameKeyword) {
        // 啟用特定監控
        const monitorKey = `${userId}_${gameKeyword.toLowerCase()}`;
        if (!monitors[monitorKey]) {
            return {
                success: false,
                count: 0,
                message: `找不到關鍵字為 '${gameKeyword}' 的監控`
            };
        }

        if (monitors[monitorKey].enabled) {
            return {
                success: false,
                count: 0,
                message: `此監控已經是啟用狀態`
            };
        }

        // 重置所有狀態
        monitors[monitorKey].enabled = true;
        monitors[monitorKey].accumulatedTime = 0;
        monitors[monitorKey].startedAt = null;
        monitors[monitorKey].lastStoppedAt = null;
        monitors[monitorKey].reminded = false;

        enabledMonitors.push(monitors[monitorKey]);
    } else {
        // 批次啟用所有監控
        Object.entries(monitors).forEach(([key, monitor]) => {
            if (monitor.userId === userId) {
                if (!monitor.enabled) {
                    monitor.enabled = true;
                    monitor.accumulatedTime = 0;
                    monitor.startedAt = null;
                    monitor.lastStoppedAt = null;
                    monitor.reminded = false;
                    enabledMonitors.push(monitor);
                }
            }
        });

        if (enabledMonitors.length === 0) {
            return {
                success: false,
                count: 0,
                message: '沒有找到可啟用的監控（可能已全部啟用或不存在）'
            };
        }
    }

    saveMonitorConfig(config);

    return {
        success: true,
        count: enabledMonitors.length,
        message: gameKeyword 
            ? `已啟用對該使用者的 ${gameKeyword} 監控`
            : `已啟用對該使用者的所有遊戲監控（共 ${enabledMonitors.length} 個）`,
        monitors: enabledMonitors
    };
}

/**
 * 停用監控並清空累積時間（可批次操作）
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string|null} gameKeyword - 遊戲關鍵字（null = 停用所有）
 * @returns {Object} { success: boolean, count: number, message: string, monitors: Array }
 */
function disableMonitoring(guildId, userId, gameKeyword = null) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) {
        return { success: false, count: 0, message: '此伺服器沒有任何監控' };
    }

    const monitors = config.guilds[guildId].monitors;
    let disabledMonitors = [];

    if (gameKeyword) {
        // 停用特定監控
        const monitorKey = `${userId}_${gameKeyword.toLowerCase()}`;
        if (!monitors[monitorKey]) {
            return {
                success: false,
                count: 0,
                message: `找不到關鍵字為 '${gameKeyword}' 的監控`
            };
        }

        if (!monitors[monitorKey].enabled) {
            return {
                success: false,
                count: 0,
                message: `此監控已經是停用狀態`
            };
        }

        // 停用並清空時間
        monitors[monitorKey].enabled = false;
        monitors[monitorKey].accumulatedTime = 0;
        monitors[monitorKey].startedAt = null;
        monitors[monitorKey].lastStoppedAt = null;
        monitors[monitorKey].reminded = false;

        disabledMonitors.push(monitors[monitorKey]);
    } else {
        // 批次停用所有監控
        Object.entries(monitors).forEach(([key, monitor]) => {
            if (monitor.userId === userId) {
                if (monitor.enabled) {
                    monitor.enabled = false;
                    monitor.accumulatedTime = 0;
                    monitor.startedAt = null;
                    monitor.lastStoppedAt = null;
                    monitor.reminded = false;
                    disabledMonitors.push(monitor);
                }
            }
        });

        if (disabledMonitors.length === 0) {
            return {
                success: false,
                count: 0,
                message: '沒有找到可停用的監控（可能已全部停用或不存在）'
            };
        }
    }

    saveMonitorConfig(config);

    return {
        success: true,
        count: disabledMonitors.length,
        message: gameKeyword 
            ? `已停用對該使用者的 ${gameKeyword} 監控（累積時間已清除）`
            : `已停用對該使用者的所有遊戲監控（共 ${disabledMonitors.length} 個，累積時間已清除）`,
        monitors: disabledMonitors
    };
}

/**
 * 重置監控狀態
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} gameKeyword - 遊戲關鍵字
 */
function resetMonitor(guildId, userId, gameKeyword) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) return;

    const monitorKey = `${userId}_${gameKeyword.toLowerCase()}`;
    const monitor = config.guilds[guildId].monitors[monitorKey];
    
    if (monitor) {
        monitor.accumulatedTime = 0;
        monitor.startedAt = null;
        monitor.lastStoppedAt = null;
        monitor.reminded = false;
        saveMonitorConfig(config);
    }
}

// ==================== 活動檢測 ====================

/**
 * 模糊比對遊戲名稱
 * @param {string} activityName - 實際活動名稱
 * @param {string} keyword - 監控關鍵字
 * @returns {boolean} 是否匹配
 */
function matchesGameKeyword(activityName, keyword) {
    if (!activityName || !keyword) return false;
    
    const normalizedActivity = activityName.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();
    
    return normalizedActivity.includes(normalizedKeyword);
}

/**
 * 根據活動尋找匹配的監控
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} activityName - 活動名稱
 * @returns {Array} 匹配的監控列表 (可能有多個)
 */
function findMonitorsByActivity(guildId, userId, activityName) {
    const monitors = getGuildMonitors(guildId);
    const matchedMonitors = [];

    Object.entries(monitors).forEach(([key, monitor]) => {
        if (monitor.userId === userId && 
            monitor.enabled && 
            matchesGameKeyword(activityName, monitor.gameKeyword)) {
            matchedMonitors.push({ key, ...monitor });
        }
    });

    return matchedMonitors;
}

// ==================== 時間追蹤 ====================

/**
 * 更新遊玩時間
 * @param {string} guildId - 伺服器 ID
 * @param {string} monitorKey - 監控鍵值
 * @returns {number} 累積時間（分鐘）
 */
function updatePlayTime(guildId, monitorKey) {
    const config = loadMonitorConfig();
    if (!config.guilds[guildId]) return 0;

    const monitor = config.guilds[guildId].monitors[monitorKey];
    if (!monitor || !monitor.startedAt) return 0;

    const startTime = moment(monitor.startedAt);
    const now = moment();
    const elapsedMinutes = now.diff(startTime, 'minutes');

    monitor.accumulatedTime = elapsedMinutes;
    saveMonitorConfig(config);

    return elapsedMinutes;
}

/**
 * 檢查是否在寬限期內
 * @param {string} lastStoppedAt - ISO 時間字串
 * @returns {boolean} 是否在寬限期內
 */
function checkGracePeriod(lastStoppedAt) {
    if (!lastStoppedAt) return false;

    const stoppedTime = moment(lastStoppedAt);
    const now = moment();
    const minutesSinceStopped = now.diff(stoppedTime, 'minutes');

    return minutesSinceStopped < GRACE_PERIOD_MINUTES;
}

/**
 * 判斷是否應該重置時間
 * @param {Object} monitor - 監控物件
 * @returns {boolean} 是否應該重置
 */
function shouldResetTime(monitor) {
    if (!monitor.lastStoppedAt) return false;
    return !checkGracePeriod(monitor.lastStoppedAt);
}

// ==================== 提醒邏輯 ====================

/**
 * 檢查是否達到時間限制
 * @param {Object} monitor - 監控物件
 * @returns {boolean} 是否達到限制
 */
function checkThresholdReached(monitor) {
    return monitor.accumulatedTime >= monitor.timeLimit;
}

/**
 * 發送遊戲時間提醒
 * @param {Client} client - Discord client
 * @param {Object} monitor - 監控物件
 * @param {string} guildId - 伺服器 ID
 */
async function sendGameReminder(client, monitor, guildId) {
    try {
        const channel = await client.channels.fetch(monitor.channelId);
        if (!channel) return;

        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(monitor.userId);
        const creator = await guild.members.fetch(monitor.createdBy);

        // 格式化時間顯示
        const hours = Math.floor(monitor.accumulatedTime / 60);
        const minutes = monitor.accumulatedTime % 60;
        const playedTimeStr = hours > 0 
            ? `${hours}小時${minutes}分鐘` 
            : `${minutes}分鐘`;

        const limitHours = Math.floor(monitor.timeLimit / 60);
        const limitMinutes = monitor.timeLimit % 60;
        const limitTimeStr = limitHours > 0
            ? `${limitHours}小時${limitMinutes > 0 ? limitMinutes + '分鐘' : ''}`
            : `${limitMinutes}分鐘`;

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('🎮 遊戲時間提醒')
            .addFields(
                { name: '玩家', value: `${member}`, inline: true },
                { name: '遊戲', value: monitor.originalGameName, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '已遊玩', value: playedTimeStr, inline: true },
                { name: '設定限制', value: limitTimeStr, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '建議', value: '該休息一下囉！記得起來動一動 💪', inline: false }
            )
            .setFooter({ 
                text: `👮 監控設定者: ${creator.user.username} | ⏰ ${moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm')}` 
            });

        await channel.send({ embeds: [embed] });

        // 標記已提醒
        const config = loadMonitorConfig();
        const monitorKey = `${monitor.userId}_${monitor.gameKeyword}`;
        if (config.guilds[guildId] && config.guilds[guildId].monitors[monitorKey]) {
            config.guilds[guildId].monitors[monitorKey].reminded = true;
            saveMonitorConfig(config);
        }
    } catch (error) {
        console.error('發送遊戲提醒時發生錯誤:', error);
    }
}

// ==================== Cron 檢查 ====================

/**
 * 檢查所有監控（每分鐘執行）
 * @param {Client} client - Discord client
 */
async function checkGameMonitors(client) {
    try {
        const config = loadMonitorConfig();

        for (const [guildId, guildData] of Object.entries(config.guilds)) {
            const monitors = guildData.monitors;

            for (const [monitorKey, monitor] of Object.entries(monitors)) {
                // 跳過停用的監控
                if (!monitor.enabled) continue;

                // 跳過未在遊玩的監控
                if (!monitor.startedAt) continue;

                // 跳過已提醒的監控
                if (monitor.reminded) continue;

                // 更新遊玩時間
                updatePlayTime(guildId, monitorKey);

                // 檢查是否達到限制
                if (checkThresholdReached(monitor)) {
                    await sendGameReminder(client, monitor, guildId);
                }
            }
        }
    } catch (error) {
        console.error('檢查遊戲監控時發生錯誤:', error);
    }
}

/**
 * 處理遊戲開始事件
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} gameName - 遊戲名稱
 */
function handleGameStart(guildId, userId, gameName) {
    const matchedMonitors = findMonitorsByActivity(guildId, userId, gameName);
    
    matchedMonitors.forEach(monitor => {
        const config = loadMonitorConfig();
        const monitorKey = `${userId}_${monitor.gameKeyword}`;
        const monitorData = config.guilds[guildId].monitors[monitorKey];

        if (!monitorData) return;

        // 檢查寬限期
        if (checkGracePeriod(monitorData.lastStoppedAt)) {
            // 在寬限期內，從上次的累積時間繼續
            monitorData.startedAt = new Date().toISOString();
            monitorData.lastStoppedAt = null;
        } else {
            // 超過寬限期，重置時間
            monitorData.startedAt = new Date().toISOString();
            monitorData.accumulatedTime = 0;
            monitorData.lastStoppedAt = null;
            monitorData.reminded = false;
        }

        saveMonitorConfig(config);
    });
}

/**
 * 處理遊戲停止事件
 * @param {string} guildId - 伺服器 ID
 * @param {string} userId - 使用者 ID
 * @param {string} gameName - 遊戲名稱
 */
function handleGameStop(guildId, userId, gameName) {
    const matchedMonitors = findMonitorsByActivity(guildId, userId, gameName);
    
    matchedMonitors.forEach(monitor => {
        const config = loadMonitorConfig();
        const monitorKey = `${userId}_${monitor.gameKeyword}`;
        const monitorData = config.guilds[guildId].monitors[monitorKey];

        if (!monitorData || !monitorData.startedAt) return;

        // 更新累積時間
        const startTime = moment(monitorData.startedAt);
        const now = moment();
        const elapsedMinutes = now.diff(startTime, 'minutes');
        monitorData.accumulatedTime += elapsedMinutes;

        // 記錄停止時間
        monitorData.lastStoppedAt = new Date().toISOString();
        monitorData.startedAt = null;

        saveMonitorConfig(config);
    });
}

// ==================== 工具函式 ====================

/**
 * 格式化時間顯示
 * @param {number} minutes - 分鐘數
 * @returns {string} 格式化的時間字串
 */
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
        return mins > 0 ? `${hours}小時${mins}分鐘` : `${hours}小時`;
    }
    return `${mins}分鐘`;
}

// ==================== 匯出 ====================

module.exports = {
    // 配置管理
    loadMonitorConfig,
    saveMonitorConfig,
    getGuildMonitors,
    getUserMonitors,
    
    // 監控操作
    startMonitoring,
    stopMonitoring,
    enableMonitoring,
    disableMonitoring,
    resetMonitor,
    
    // 活動檢測
    matchesGameKeyword,
    findMonitorsByActivity,
    
    // 時間追蹤
    updatePlayTime,
    checkGracePeriod,
    shouldResetTime,
    
    // 提醒邏輯
    checkThresholdReached,
    sendGameReminder,
    
    // Cron 檢查
    checkGameMonitors,
    
    // 事件處理
    handleGameStart,
    handleGameStop,
    
    // 工具函式
    formatTime,
    
    // 常量
    GRACE_PERIOD_MINUTES
};
