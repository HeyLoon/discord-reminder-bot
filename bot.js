const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ActivityType,
  MessageFlags,
} = require("discord.js");
const cron = require("node-cron");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const dailyWord = require("./daily-word.js");
const stockReminder = require("./stock-reminder.js");
const gameMonitor = require("./game-monitor.js");
const buildCommands = require("./src/commands/build-commands");

// 載入環境變數
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

// 支援 Docker volume 掛載
const DATA_DIR = process.env.DATA_DIR || __dirname;
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

// ==================== 數據管理 ====================

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

// 讀取提醒數據
function loadReminders() {
  return loadJsonWithDefault(REMINDERS_FILE, () => []);
}

// 保存提醒數據
function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

// 讀取配置
function loadConfig() {
  return loadJsonWithDefault(CONFIG_FILE, () => ({ guilds: {}, version: "2.0" }));
}

// 保存配置
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 獲取伺服器配置
function getGuildConfig(guildId) {
  const config = loadConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      timezone: "Asia/Taipei",
      staffRoles: [],
      customAvatar: null,
      customUsername: null,
    };
    saveConfig(config);
  }
  return config.guilds[guildId];
}

// 更新伺服器配置
function updateGuildConfig(guildId, updates) {
  const config = loadConfig();
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      timezone: "Asia/Taipei",
      staffRoles: [],
      customAvatar: null,
      customUsername: null,
    };
  }
  Object.assign(config.guilds[guildId], updates);
  saveConfig(config);
}

// 檢查用戶權限
function hasPermission(interaction) {
  // 管理員始終有權限
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const guildConfig = getGuildConfig(interaction.guildId);

  // 檢查用戶是否有staff角色
  const hasStaffRole = interaction.member.roles.cache.some((role) =>
    guildConfig.staffRoles.includes(role.id),
  );

  return hasStaffRole;
}

// ==================== 提醒處理 ====================

// 檢查並發送提醒
function checkReminders() {
  const reminders = loadReminders();
  const now = new Date();

  const updatedReminders = [];

  for (const reminder of reminders) {
    const guildConfig = getGuildConfig(reminder.guildId);
    const timezone = guildConfig.timezone || "Asia/Taipei";
    const nowInTimezone = moment().tz(timezone);
    const reminderTime = moment.tz(reminder.datetime, timezone);

    // 檢查是否應該發送提醒
    if (nowInTimezone.isSameOrAfter(reminderTime) && !reminder.sent) {
      // 檢查是否在跳過的日期
      if (reminder.skipDays && reminder.skipDays.length > 0) {
        const dayOfWeek = nowInTimezone.day(); // 0-6 (Sunday-Saturday)
        if (reminder.skipDays.includes(dayOfWeek)) {
          // 如果是重複提醒，更新下次時間
          if (reminder.repeat) {
            reminder.datetime = getNextReminderTime(reminder, timezone);
            reminder.sent = false;
            updatedReminders.push(reminder);
          }
          continue;
        }
      }

      sendReminder(reminder);

      // 處理重複提醒
      if (reminder.repeat) {
        reminder.datetime = getNextReminderTime(reminder, timezone);
        reminder.sent = false;

        // 檢查是否超過過期次數
        if (reminder.expiresAfter) {
          reminder.sentCount = (reminder.sentCount || 0) + 1;
          if (reminder.sentCount >= reminder.expiresAfter) {
            continue; // 不保存，讓它被刪除
          }
        }

        updatedReminders.push(reminder);
      }
    } else {
      updatedReminders.push(reminder);
    }
  }

  saveReminders(updatedReminders);
}

// 計算下次提醒時間
function getNextReminderTime(reminder, timezone) {
  const current = moment.tz(reminder.datetime, timezone);

  switch (reminder.repeatInterval) {
    case "hourly":
      return current.add(1, "hour").format("YYYY-MM-DD HH:mm");
    case "daily":
      return current.add(1, "day").format("YYYY-MM-DD HH:mm");
    case "weekly":
      return current.add(1, "week").format("YYYY-MM-DD HH:mm");
    case "monthly":
      return current.add(1, "month").format("YYYY-MM-DD HH:mm");
    case "yearly":
      return current.add(1, "year").format("YYYY-MM-DD HH:mm");
    default:
      return current.add(1, "day").format("YYYY-MM-DD HH:mm");
  }
}

// 發送提醒訊息
async function sendReminder(reminder) {
  try {
    const channelId = reminder.channelId || process.env.CHANNEL_ID;
    const channel = await client.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setColor(reminder.color || "#5865F2")
      .setTitle(reminder.title || "⏰ 提醒通知")
      .setDescription(
        reminder.ping
          ? `<@${reminder.userId}>，提醒時間到了！`
          : "提醒時間到！",
      );

    if (reminder.reason) {
      embed.addFields({ name: "提醒內容", value: reminder.reason });
    }

    if (reminder.datetime) {
      embed.addFields({ name: "原定時間", value: reminder.datetime });
    }

    if (reminder.repeat) {
      embed.addFields({
        name: "重複設置",
        value: `${getRepeatText(reminder.repeatInterval)}${reminder.expiresAfter ? ` (剩餘 ${reminder.expiresAfter - (reminder.sentCount || 0)} 次)` : ""}`,
      });
    }

    if (reminder.image) {
      embed.setImage(reminder.image);
    }

    if (reminder.thumbnail) {
      embed.setThumbnail(reminder.thumbnail);
    }

    if (reminder.footer) {
      embed.setFooter({ text: reminder.footer });
    } else {
      embed.setFooter({ text: "Reminder Bot" });
    }

    if (reminder.timestamp) {
      embed.setTimestamp();
    }

    const messageContent = reminder.ping ? `<@${reminder.userId}>` : "";

    await channel.send({
      content: messageContent,
      embeds: [embed],
    });

    console.log(
      `已發送提醒: ${reminder.reason || "無標題"} 給用戶 ${reminder.userId}`,
    );
  } catch (error) {
    console.error("發送提醒時出錯:", error);
  }
}

function getRepeatText(interval) {
  const texts = {
    hourly: "每小時",
    daily: "每天",
    weekly: "每週",
    monthly: "每月",
    yearly: "每年",
  };
  return texts[interval] || "每天";
}

// ==================== 指令處理 ====================

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    if (!stockReminder.isStockWordPageButton(interaction.customId)) {
      return;
    }

    const page = stockReminder.getStockWordPageFromCustomId(
      interaction.customId,
    );
    const pagePayload = await stockReminder.getStockWordPageResponseWithFallback(
      interaction.message,
      page,
      interaction.guildId,
    );
    if (!pagePayload) {
      return interaction.reply({
        content:
          "⚠️ 無法切換頁面，請使用 `/stock-reminder send-now` 重新產生。",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.update(pagePayload);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ===== Reminder Commands =====
  if (commandName === "reminder") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const user = interaction.options.getUser("用戶");
      const reason = interaction.options.getString("內容");
      const timeStr = interaction.options.getString("時間");
      const dateStr = interaction.options.getString("日期");
      const channel = interaction.options.getChannel("頻道");
      const repeat = interaction.options.getBoolean("重複") || false;
      const repeatInterval =
        interaction.options.getString("重複間隔") || "daily";
      const ping = interaction.options.getBoolean("提及用戶") !== false;
      const title = interaction.options.getString("標題");
      const color = interaction.options.getString("顏色");
      const image = interaction.options.getString("圖片");
      const thumbnail = interaction.options.getString("縮圖");
      const footer = interaction.options.getString("底部文字");
      const timestamp = interaction.options.getBoolean("顯示時間戳") || false;
      const expiresAfter = interaction.options.getInteger("過期次數");
      const skipDaysStr = interaction.options.getString("跳過星期");

      // 獲取時區並處理時間
      const guildConfig = getGuildConfig(interaction.guildId);
      const timezone = guildConfig.timezone || "Asia/Taipei";
      const now = moment().tz(timezone);

      // 處理日期 - 預設今天
      let year, month, day;
      if (dateStr) {
        // 驗證日期格式
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) {
          return interaction.reply({
            content:
              "❌ 日期格式錯誤！請使用 YYYY-MM-DD 格式，例如: 2026-02-15",
            flags: MessageFlags.Ephemeral,
          });
        }
        const dateParts = dateStr.split("-");
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]);
        day = parseInt(dateParts[2]);
      } else {
        // 預設今天
        year = now.year();
        month = now.month() + 1;
        day = now.date();
      }

      // 處理時間 - 預設當前時間
      let hour, minute;
      if (timeStr) {
        // 驗證時間格式 (支援 1:01, 01:01, 13:45 等格式)
        const timeRegex = /^\d{1,2}:\d{1,2}$/;
        if (!timeRegex.test(timeStr)) {
          return interaction.reply({
            content:
              "❌ 時間格式錯誤！請使用 HH:mm 或 H:m 格式，例如: 14:30, 01:05, 1:1",
            flags: MessageFlags.Ephemeral,
          });
        }
        const timeParts = timeStr.split(":");
        hour = parseInt(timeParts[0]);
        minute = parseInt(timeParts[1]);

        // 驗證時間範圍
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          return interaction.reply({
            content: "❌ 時間範圍錯誤！小時應為 0-23，分鐘應為 0-59",
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        // 預設當前時間
        hour = now.hour();
        minute = now.minute();
      }

      // 組合完整時間字串
      const datetime = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      // 驗證日期是否有效
      const reminderMoment = moment.tz(datetime, "YYYY-MM-DD HH:mm", timezone);
      if (!reminderMoment.isValid()) {
        return interaction.reply({
          content: "❌ 無效的日期！請檢查日期是否正確（例如：2月沒有30日）",
          flags: MessageFlags.Ephemeral,
        });
      }

      // 檢查提醒時間是否已經過去或正在進行（只對非重複提醒檢查）
      // 重複提醒允許設定過去的時間，因為它會自動跳到下一次
      if (!repeat) {
        const nowMoment = moment().tz(timezone);
        if (reminderMoment.isSameOrBefore(nowMoment)) {
          return interaction.reply({
            content:
              `❌ 提醒時間已經過去或正在進行！\n` +
              `當前時間: ${nowMoment.format("YYYY-MM-DD HH:mm")} (${timezone})\n` +
              `設定時間: ${reminderMoment.format("YYYY-MM-DD HH:mm")}\n` +
              `請設定未來的時間。`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // 解析跳過的星期
      let skipDays = [];
      if (skipDaysStr) {
        skipDays = skipDaysStr
          .split(",")
          .map((d) => parseInt(d.trim()))
          .filter((d) => d >= 0 && d <= 6);
      }

      const targetChannelId = channel ? channel.id : interaction.channel.id;

      const reminders = loadReminders();
      const newReminder = {
        id: Date.now(),
        guildId: interaction.guildId,
        userId: user.id,
        channelId: targetChannelId,
        datetime: datetime,
        reason: reason,
        repeat: repeat,
        repeatInterval: repeat ? repeatInterval : null,
        ping: ping,
        title: title,
        color: color,
        image: image,
        thumbnail: thumbnail,
        footer: footer,
        timestamp: timestamp,
        expiresAfter: expiresAfter,
        skipDays: skipDays,
        sentCount: 0,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
        sent: false,
      };

      reminders.push(newReminder);
      saveReminders(reminders);

      const embed = new EmbedBuilder()
        .setColor("#4CAF50")
        .setTitle("✅ 提醒已創建")
        .addFields(
          { name: "用戶", value: `<@${user.id}>`, inline: true },
          { name: "時間", value: datetime, inline: true },
          { name: "頻道", value: `<#${targetChannelId}>`, inline: true },
          { name: "內容", value: reason },
        );

      if (repeat) {
        embed.addFields({
          name: "重複設置",
          value: `${getRepeatText(repeatInterval)}${expiresAfter ? ` (共 ${expiresAfter} 次)` : " (無限)"}`,
        });
      }

      if (skipDays.length > 0) {
        const dayNames = [
          "週日",
          "週一",
          "週二",
          "週三",
          "週四",
          "週五",
          "週六",
        ];
        embed.addFields({
          name: "跳過日期",
          value: skipDays.map((d) => dayNames[d]).join(", "),
        });
      }

      embed.setFooter({ text: `ID: ${newReminder.id}` });

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "remove") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const id = interaction.options.getInteger("id");
      const reminders = loadReminders();
      const index = reminders.findIndex(
        (r) => r.id === id && r.guildId === interaction.guildId,
      );

      if (index === -1) {
        return interaction.reply({
          content: "找不到該提醒ID！",
          flags: MessageFlags.Ephemeral,
        });
      }

      reminders.splice(index, 1);
      saveReminders(reminders);

      await interaction.reply({ content: "✅ 提醒已刪除！" });
    } else if (subcommand === "list") {
      const reminders = loadReminders().filter(
        (r) => r.guildId === interaction.guildId,
      );

      if (reminders.length === 0) {
        return interaction.reply({
          content: "目前沒有任何提醒！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#2196F3")
        .setTitle("📋 所有提醒列表")
        .setDescription(
          reminders
            .map((r, i) => {
              let desc = `**${i + 1}.** ID: ${r.id}\n`;
              desc += `<@${r.userId}> - ${r.datetime} - <#${r.channelId}>\n`;
              desc += `內容: ${r.reason} `;
              desc += r.repeat ? `🔄 ${getRepeatText(r.repeatInterval)}` : "";
              desc += r.sent ? " ✅" : " ⏳";
              return desc;
            })
            .join("\n\n"),
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "edit") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const id = interaction.options.getInteger("id");
      const newTime = interaction.options.getString("時間");
      const newReason = interaction.options.getString("內容");

      const reminders = loadReminders();
      const reminder = reminders.find(
        (r) => r.id === id && r.guildId === interaction.guildId,
      );

      if (!reminder) {
        return interaction.reply({
          content: "找不到該提醒ID！",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (newTime) {
        const datetimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
        if (!datetimeRegex.test(newTime)) {
          return interaction.reply({
            content: "時間格式錯誤！請使用 YYYY-MM-DD HH:mm 格式",
            flags: MessageFlags.Ephemeral,
          });
        }
        reminder.datetime = newTime;
        reminder.sent = false;
      }

      if (newReason) {
        reminder.reason = newReason;
      }

      saveReminders(reminders);

      await interaction.reply({ content: "✅ 提醒已更新！" });
    } else if (subcommand === "customize") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: "❌ 只有管理員可以使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const username = interaction.options.getString("用戶名");
      const avatar = interaction.options.getString("頭像");

      updateGuildConfig(interaction.guildId, {
        customUsername: username,
        customAvatar: avatar,
      });

      await interaction.reply({
        content: "✅ 機器人外觀已自定義！（注意：此功能需要webhook支持）",
      });
    } else if (subcommand === "dst-forward") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: "❌ 只有管理員可以使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const reminders = loadReminders();
      let count = 0;

      reminders.forEach((reminder) => {
        if (reminder.guildId === interaction.guildId) {
          const time = moment(reminder.datetime, "YYYY-MM-DD HH:mm");
          reminder.datetime = time.add(1, "hour").format("YYYY-MM-DD HH:mm");
          count++;
        }
      });

      saveReminders(reminders);

      await interaction.reply({
        content: `✅ 已將 ${count} 個提醒時間向前調整1小時！`,
      });
    } else if (subcommand === "dst-backward") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: "❌ 只有管理員可以使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const reminders = loadReminders();
      let count = 0;

      reminders.forEach((reminder) => {
        if (reminder.guildId === interaction.guildId) {
          const time = moment(reminder.datetime, "YYYY-MM-DD HH:mm");
          reminder.datetime = time
            .subtract(1, "hour")
            .format("YYYY-MM-DD HH:mm");
          count++;
        }
      });

      saveReminders(reminders);

      await interaction.reply({
        content: `✅ 已將 ${count} 個提醒時間向後調整1小時！`,
      });
    }
  }

  // ===== Settings Commands =====
  else if (commandName === "settings") {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "❌ 只有管理員可以使用此指令！",
        flags: MessageFlags.Ephemeral,
      });
    }

    const group = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (group === "timezone") {
      if (subcommand === "set") {
        const timezone = interaction.options.getString("時區");

        // 驗證時區
        if (!moment.tz.zone(timezone)) {
          return interaction.reply({
            content:
              "❌ 無效的時區！請使用有效的時區名稱，例如: Asia/Taipei, America/New_York",
            flags: MessageFlags.Ephemeral,
          });
        }

        updateGuildConfig(interaction.guildId, { timezone });

        await interaction.reply({ content: `✅ 時區已設置為: ${timezone}` });
      } else if (subcommand === "view") {
        const guildConfig = getGuildConfig(interaction.guildId);
        const currentTime = moment()
          .tz(guildConfig.timezone)
          .format("YYYY-MM-DD HH:mm:ss");

        const embed = new EmbedBuilder()
          .setColor("#2196F3")
          .setTitle("🌍 時區設置")
          .addFields(
            { name: "當前時區", value: guildConfig.timezone },
            { name: "當前時間", value: currentTime },
          );

        await interaction.reply({ embeds: [embed] });
      }
    } else if (group === "staff_role") {
      if (subcommand === "add") {
        const role = interaction.options.getRole("角色");
        const guildConfig = getGuildConfig(interaction.guildId);

        if (guildConfig.staffRoles.includes(role.id)) {
          return interaction.reply({
            content: "❌ 該角色已經有權限了！",
            flags: MessageFlags.Ephemeral,
          });
        }

        guildConfig.staffRoles.push(role.id);
        updateGuildConfig(interaction.guildId, guildConfig);

        await interaction.reply({
          content: `✅ 已添加角色 <@&${role.id}> 的權限！`,
        });
      } else if (subcommand === "remove") {
        const role = interaction.options.getRole("角色");
        const guildConfig = getGuildConfig(interaction.guildId);

        const index = guildConfig.staffRoles.indexOf(role.id);
        if (index === -1) {
          return interaction.reply({
            content: "❌ 該角色沒有權限！",
            flags: MessageFlags.Ephemeral,
          });
        }

        guildConfig.staffRoles.splice(index, 1);
        updateGuildConfig(interaction.guildId, guildConfig);

        await interaction.reply({
          content: `✅ 已移除角色 <@&${role.id}> 的權限！`,
        });
      } else if (subcommand === "list") {
        const guildConfig = getGuildConfig(interaction.guildId);

        if (guildConfig.staffRoles.length === 0) {
          return interaction.reply({
            content: "目前沒有設置權限角色。",
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setColor("#2196F3")
          .setTitle("👥 權限角色列表")
          .setDescription(
            guildConfig.staffRoles
              .map((roleId, i) => `${i + 1}. <@&${roleId}>`)
              .join("\n"),
          );

        await interaction.reply({ embeds: [embed] });
      }
    }
  }

  // ===== Daily Word Commands =====
  else if (commandName === "daily-word") {
    await interaction.reply({
      content:
        "ℹ️ `/daily-word` 已整合到 `/stock-reminder`，請改用 `/stock-reminder setup|status|history|reset-history|send-now|toggle`。",
      flags: MessageFlags.Ephemeral,
    });
  }

  // ===== Stock Reminder Commands =====
  else if (commandName === "stock-reminder") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.options.getChannel("頻道");
      const timeStr = interaction.options.getString("時間") || "08:30";
      const level = interaction.options.getString("難度") || "all";
      const mentionUser = interaction.options.getUser("用戶");

      const timeRegex = /^\d{1,2}:\d{1,2}$/;
      if (!timeRegex.test(timeStr)) {
        return interaction.reply({
          content:
            "❌ 時間格式錯誤！請使用 HH:mm 或 H:m 格式，例如: 08:30, 8:3",
          flags: MessageFlags.Ephemeral,
        });
      }

      const timeParts = timeStr.split(":");
      const hour = String(parseInt(timeParts[0])).padStart(2, "0");
      const minute = String(parseInt(timeParts[1])).padStart(2, "0");
      const formattedTime = `${hour}:${minute}`;

      const guildConfig = getGuildConfig(interaction.guildId);
      const timezone = guildConfig.timezone || "Asia/Taipei";

      stockReminder.updateGuildStockConfig(interaction.guildId, {
        enabled: true,
        channelId: channel.id,
        sendTime: formattedTime,
        mentionUserId: mentionUser ? mentionUser.id : null,
        timezone: timezone,
      });
      dailyWord.updateGuildWordConfig(interaction.guildId, {
        enabled: true,
        channelId: channel.id,
        sendTime: formattedTime,
        jlptLevel: level,
        mentionUserId: mentionUser ? mentionUser.id : null,
        timezone: timezone,
      });

      await interaction.reply({
        content:
          `✅ 股市提醒功能已設置！\n` +
          `📍 頻道: ${channel}\n` +
          `⏰ 時間: ${formattedTime} (${timezone})\n` +
          `📊 單字難度: ${level === "all" ? "全部等級" : level.toUpperCase()}\n` +
          `${mentionUser ? `👤 提及: ${mentionUser}\n` : ""}` +
          `📌 內容: 單一訊息（按鈕換頁）\n` +
          `・第 1 頁：股市（時事 + 指數 + 台股收盤）\n` +
          `・第 2 頁：每日單字（無圖片）\n` +
          `\n正在發送測試提醒...`,
        flags: MessageFlags.Ephemeral,
      });

      const config = stockReminder.getGuildStockConfig(interaction.guildId);
      const result = await stockReminder.sendStockReminder(
        client,
        interaction.guildId,
        channel.id,
        config,
        true,
      );

      if (result.success) {
        await interaction.followUp({
          content: "✅ 測試財經提醒發送成功！",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: `⚠️ 測試財經提醒發送失敗: ${result.error}\n請檢查網路連接或稍後重試。`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (subcommand === "send-now") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = stockReminder.getGuildStockConfig(interaction.guildId);
      if (!config.enabled || !config.channelId) {
        return interaction.reply({
          content:
            "❌ 尚未設置整合提醒功能！請先使用 `/stock-reminder setup` 進行設置。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: "⏳ 正在整理並發送財經提醒...",
        flags: MessageFlags.Ephemeral,
      });

      const result = await stockReminder.sendStockReminder(
        client,
        interaction.guildId,
        config.channelId,
        config,
        true,
      );
      if (result.success) {
        await interaction.editReply({ content: "✅ 財經提醒發送成功！" });
      } else {
        await interaction.editReply({
          content: `❌ 財經提醒發送失敗: ${result.error}`,
        });
      }
    } else if (subcommand === "status") {
      const config = stockReminder.getGuildStockConfig(interaction.guildId);
      const wordConfig = dailyWord.getGuildWordConfig(interaction.guildId);
      if (!config.enabled) {
        return interaction.reply({
          content:
            "❌ 整合提醒功能尚未啟用。請使用 `/stock-reminder setup` 進行設置。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = await client.channels
        .fetch(config.channelId)
        .catch(() => null);
      const channelName = channel ? `<#${channel.id}>` : "頻道不存在";

      const embed = new EmbedBuilder()
        .setColor("#2ECC71")
        .setTitle("📈 股市提醒狀態")
        .addFields(
          {
            name: "📊 狀態",
            value: config.enabled ? "✅ 已啟用" : "❌ 已停用",
            inline: true,
          },
          { name: "📍 頻道", value: channelName, inline: true },
          {
            name: "⏰ 發送時間",
            value: `${config.sendTime} (${config.timezone})`,
            inline: true,
          },
          {
            name: "📖 單字難度",
            value:
              wordConfig.jlptLevel === "all"
                ? "全部等級"
                : wordConfig.jlptLevel.toUpperCase(),
            inline: true,
          },
          {
            name: "📌 內容",
            value:
              "單一訊息（按鈕換頁）：第 1 頁股市 / 第 2 頁每日單字（無圖片）",
            inline: false,
          },
          {
            name: "📈 已發送",
            value: `${config.totalSent || 0} 則提醒`,
            inline: true,
          },
          {
            name: "📅 最後發送",
            value: config.lastSentDate || "尚未發送",
            inline: true,
          },
        );

      if (config.mentionUserId) {
        embed.addFields({
          name: "👤 提及用戶",
          value: `<@${config.mentionUserId}>`,
        });
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "toggle") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = stockReminder.getGuildStockConfig(interaction.guildId);
      if (!config.channelId) {
        return interaction.reply({
          content:
            "❌ 尚未設置整合提醒功能！請先使用 `/stock-reminder setup` 進行設置。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const newStatus = !config.enabled;
      stockReminder.updateGuildStockConfig(interaction.guildId, {
        enabled: newStatus,
      });
      dailyWord.updateGuildWordConfig(interaction.guildId, {
        enabled: newStatus,
      });

      await interaction.reply({
        content: `✅ 整合提醒功能已${newStatus ? "開啟" : "關閉"}！`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "history") {
      const history = dailyWord.getGuildWordHistory(interaction.guildId);
      if (history.length === 0) {
        return interaction.reply({
          content: "📝 尚無單字歷史記錄。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const recentHistory = history.slice(-10).reverse();
      const embed = new EmbedBuilder()
        .setColor("#FF6B81")
        .setTitle("📚 最近發送的單字")
        .setDescription(
          recentHistory
            .map((item, index) => {
              const date = moment(item.sentAt).format("MM/DD HH:mm");
              return `${index + 1}. **${item.word}** (${item.reading}) - ${date}`;
            })
            .join("\n"),
        )
        .setFooter({ text: `總共發送過 ${history.length} 個單字` });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "reset-history") {
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const history = dailyWord.getGuildWordHistory(interaction.guildId);
      if (history.length === 0) {
        return interaction.reply({
          content: "📝 歷史記錄已經是空的了。",
          flags: MessageFlags.Ephemeral,
        });
      }

      dailyWord.clearGuildWordHistory(interaction.guildId);
      await interaction.reply({
        content: `✅ 已清空單字歷史記錄！（共 ${history.length} 個單字）\n單字將重新開始循環。`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ===== Game Monitor Commands =====
  else if (commandName === "game-monitor") {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      // 檢查權限
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = interaction.options.getUser("member");
      const timeLimit = interaction.options.getInteger("time");
      const keyword = interaction.options.getString("keyword");

      // 獲取成員的當前遊戲狀態
      const guildMember = await interaction.guild.members.fetch(member.id);
      const presence = guildMember.presence;

      let gameName = keyword;
      let actualKeyword = keyword;

      // 如果沒提供關鍵字，嘗試從當前活動獲取
      if (!keyword) {
        if (
          !presence ||
          !presence.activities ||
          presence.activities.length === 0
        ) {
          return interaction.reply({
            content:
              "❌ 該成員目前沒有在玩遊戲，且未提供遊戲關鍵字！\n請在成員遊玩遊戲時執行，或手動提供遊戲關鍵字。",
            flags: MessageFlags.Ephemeral,
          });
        }

        // 找第一個「Playing」類型的活動
        const playingActivity = presence.activities.find(
          (a) => a.type === ActivityType.Playing,
        );
        if (!playingActivity) {
          return interaction.reply({
            content:
              "❌ 該成員目前沒有在玩遊戲，且未提供遊戲關鍵字！\n請提供遊戲關鍵字參數。",
            flags: MessageFlags.Ephemeral,
          });
        }

        gameName = playingActivity.name;
        actualKeyword = gameName.toLowerCase().split(" ")[0]; // 使用第一個單字作為關鍵字
      }

      // 建立監控
      const result = gameMonitor.startMonitoring(
        interaction.guildId,
        member.id,
        actualKeyword,
        gameName,
        timeLimit,
        interaction.channel.id,
        interaction.user.id,
      );

      if (!result.success) {
        return interaction.reply({
          content: `❌ ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // 如果成員當下正在玩匹配的遊戲，立即開始計時
      if (presence && presence.activities) {
        const currentGame = presence.activities.find(
          (a) =>
            a.type === ActivityType.Playing &&
            gameMonitor.matchesGameKeyword(a.name, actualKeyword),
        );

        if (currentGame) {
          gameMonitor.handleGameStart(
            interaction.guildId,
            member.id,
            currentGame.name,
          );
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#4CAF50")
        .setTitle("✅ 遊戲監控已建立")
        .addFields(
          { name: "👤 玩家", value: `${member}`, inline: true },
          { name: "🎮 遊戲關鍵字", value: actualKeyword, inline: true },
          {
            name: "⏱️ 時間限制",
            value: gameMonitor.formatTime(timeLimit),
            inline: true,
          },
          {
            name: "📍 提醒頻道",
            value: `${interaction.channel}`,
            inline: true,
          },
          { name: "📊 狀態", value: "✅ 啟用中", inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
        )
        .setFooter({ text: `設定者: ${interaction.user.username}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "stop") {
      // 檢查權限
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = interaction.options.getUser("member");
      const keyword = interaction.options.getString("keyword");

      if (!keyword) {
        // 沒提供關鍵字，列出該成員所有監控
        const userMonitors = gameMonitor.getUserMonitors(
          interaction.guildId,
          member.id,
        );

        if (userMonitors.length === 0) {
          return interaction.reply({
            content: `❌ ${member} 目前沒有任何監控。`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setColor("#2196F3")
          .setTitle(`🎮 ${member.username} 的監控列表`)
          .setDescription(
            "請使用 `/game-monitor stop` 並指定遊戲關鍵字來刪除監控：\n\n" +
              userMonitors
                .map(
                  (m, i) =>
                    `${i + 1}. **${m.gameKeyword}** (${m.originalGameName}) - ${gameMonitor.formatTime(m.timeLimit)}`,
                )
                .join("\n"),
          );

        return interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      // 刪除監控
      const result = gameMonitor.stopMonitoring(
        interaction.guildId,
        member.id,
        keyword,
      );

      if (!result.success) {
        return interaction.reply({
          content: `❌ ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ 已刪除對 ${member} 的 **${keyword}** 監控。`,
        ephemeral: false,
      });
    } else if (subcommand === "enable") {
      // 檢查權限
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = interaction.options.getUser("member");
      const keyword = interaction.options.getString("keyword");

      const result = gameMonitor.enableMonitoring(
        interaction.guildId,
        member.id,
        keyword,
      );

      if (!result.success) {
        return interaction.reply({
          content: `❌ ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // 檢查成員是否正在玩匹配的遊戲
      const guildMember = await interaction.guild.members.fetch(member.id);
      const presence = guildMember.presence;

      if (presence && presence.activities && result.monitors.length > 0) {
        for (const monitor of result.monitors) {
          const currentGame = presence.activities.find(
            (a) =>
              a.type === ActivityType.Playing &&
              gameMonitor.matchesGameKeyword(a.name, monitor.gameKeyword),
          );

          if (currentGame) {
            gameMonitor.handleGameStart(
              interaction.guildId,
              member.id,
              currentGame.name,
            );
          }
        }
      }

      await interaction.reply({
        content: `✅ ${result.message}\n💡 累積時間已重置為 0。`,
        ephemeral: false,
      });
    } else if (subcommand === "disable") {
      // 檢查權限
      if (!hasPermission(interaction)) {
        return interaction.reply({
          content: "❌ 你沒有權限使用此指令！",
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = interaction.options.getUser("member");
      const keyword = interaction.options.getString("keyword");

      const result = gameMonitor.disableMonitoring(
        interaction.guildId,
        member.id,
        keyword,
      );

      if (!result.success) {
        return interaction.reply({
          content: `❌ ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `⏸️ ${result.message}`,
        ephemeral: false,
      });
    } else if (subcommand === "status") {
      const member = interaction.options.getUser("member");
      const targetUserId = member ? member.id : interaction.user.id;
      const targetUser = member || interaction.user;

      const userMonitors = gameMonitor.getUserMonitors(
        interaction.guildId,
        targetUserId,
      );

      if (userMonitors.length === 0) {
        return interaction.reply({
          content: `📊 ${targetUser} 目前沒有任何監控。`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // 獲取成員當前狀態
      const guildMember = await interaction.guild.members.fetch(targetUserId);
      const presence = guildMember.presence;
      const currentGames =
        presence?.activities
          ?.filter((a) => a.type === ActivityType.Playing)
          ?.map((a) => a.name) || [];

      const embed = new EmbedBuilder()
        .setColor("#FF6B6B")
        .setTitle(`🎮 ${targetUser.username} 的遊戲監控狀態`)
        .setThumbnail(targetUser.displayAvatarURL());

      for (let i = 0; i < userMonitors.length; i++) {
        const monitor = userMonitors[i];
        const isPlaying = currentGames.some((game) =>
          gameMonitor.matchesGameKeyword(game, monitor.gameKeyword),
        );

        // 如果正在玩，實時更新累積時間
        let displayTime = monitor.accumulatedTime;
        if (isPlaying && monitor.startedAt) {
          const startTime = moment(monitor.startedAt);
          const now = moment();
          displayTime = now.diff(startTime, "minutes");
        }

        const statusEmoji = monitor.enabled ? "✅" : "⏸️";
        const statusText = monitor.enabled ? "啟用中" : "已停用";
        const playingText = isPlaying ? "🎮 正在遊玩" : "未遊玩";

        embed.addFields({
          name: `${i + 1}. ${monitor.originalGameName}`,
          value:
            `**關鍵字**: ${monitor.gameKeyword}\n` +
            `**限制**: ${gameMonitor.formatTime(monitor.timeLimit)}\n` +
            `**已遊玩**: ${gameMonitor.formatTime(displayTime)}\n` +
            `**狀態**: ${statusEmoji} ${statusText}\n` +
            `**目前**: ${playingText}`,
          inline: userMonitors.length === 1 ? false : true,
        });

        // 每兩個監控加一個空白欄位（排版）
        if (
          userMonitors.length > 1 &&
          i % 2 === 1 &&
          i < userMonitors.length - 1
        ) {
          embed.addFields({ name: "\u200b", value: "\u200b", inline: false });
        }
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const allMonitors = gameMonitor.getGuildMonitors(interaction.guildId);
      const monitorEntries = Object.values(allMonitors);

      if (monitorEntries.length === 0) {
        return interaction.reply({
          content: "📊 本伺服器目前沒有任何遊戲監控。",
          flags: MessageFlags.Ephemeral,
        });
      }

      // 按使用者分組
      const monitorsByUser = {};
      for (const monitor of monitorEntries) {
        if (!monitorsByUser[monitor.userId]) {
          monitorsByUser[monitor.userId] = [];
        }
        monitorsByUser[monitor.userId].push(monitor);
      }

      const embed = new EmbedBuilder()
        .setColor("#2196F3")
        .setTitle("📊 本伺服器的遊戲監控清單")
        .setTimestamp();

      let enabledCount = 0;
      let disabledCount = 0;

      for (const [userId, monitors] of Object.entries(monitorsByUser)) {
        const monitorList = monitors
          .map((m) => {
            const statusEmoji = m.enabled ? "✅" : "⏸️";
            if (m.enabled) enabledCount++;
            else disabledCount++;

            return `  ${statusEmoji} ${m.originalGameName} (${gameMonitor.formatTime(m.timeLimit)})`;
          })
          .join("\n");

        embed.addFields({
          name: `👤 <@${userId}>`,
          value: monitorList,
          inline: false,
        });
      }

      embed.setFooter({
        text: `總計: ${monitorEntries.length} 個監控 (${enabledCount} 個啟用，${disabledCount} 個停用)`,
      });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// ==================== Presence Update 處理 ====================

client.on("presenceUpdate", async (oldPresence, newPresence) => {
  try {
    // 確保有必要的資料
    if (!newPresence || !newPresence.guild || !newPresence.userId) return;

    const guildId = newPresence.guild.id;
    const userId = newPresence.userId;

    // 獲取舊的和新的活動
    const oldActivities = oldPresence?.activities || [];
    const newActivities = newPresence.activities || [];

    // 只關注「Playing」類型的活動 (type 0)
    const oldGames = oldActivities
      .filter((a) => a.type === ActivityType.Playing)
      .map((a) => a.name);
    const newGames = newActivities
      .filter((a) => a.type === ActivityType.Playing)
      .map((a) => a.name);

    // 檢測開始遊玩的遊戲（在新活動中但不在舊活動中）
    const startedGames = newGames.filter((game) => !oldGames.includes(game));

    // 檢測停止遊玩的遊戲（在舊活動中但不在新活動中）
    const stoppedGames = oldGames.filter((game) => !newGames.includes(game));

    // 處理開始遊玩
    for (const gameName of startedGames) {
      gameMonitor.handleGameStart(guildId, userId, gameName);
      console.log(`[遊戲監控] ${userId} 開始玩 ${gameName}`);
    }

    // 處理停止遊玩
    for (const gameName of stoppedGames) {
      gameMonitor.handleGameStop(guildId, userId, gameName);
      console.log(`[遊戲監控] ${userId} 停止玩 ${gameName}`);
    }
  } catch (error) {
    console.error("處理 presenceUpdate 時發生錯誤:", error);
  }
});

// ==================== 機器人啟動 ====================

// ==================== 自動註冊斜線指令 ====================
async function registerSlashCommands() {
  if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.log("⚠️  跳過指令註冊：缺少 CLIENT_ID 或 GUILD_ID");
    return;
  }

  try {
    console.log("🔄 開始註冊斜線指令...");
    const commands = buildCommands();

    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN,
    );

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );

    console.log(`✅ 成功註冊 ${data.length} 個斜線指令！`);
    console.log(
      "指令列表: /reminder, /settings, /stock-reminder, /game-monitor",
    );
  } catch (error) {
    console.error("❌ 註冊指令時出錯:", error.message);
    console.log("💡 提示: 可以稍後手動執行 npm run deploy-guild");
  }
}

client.on("clientReady", async () => {
  console.log(`✅ 機器人已登入: ${client.user.tag}`);
  console.log(`📊 伺服器數量: ${client.guilds.cache.size}`);
  console.log("");

  // 自動註冊斜線指令
  await registerSlashCommands();
  console.log("");

  // 每分鐘檢查一次提醒（更精確）
  cron.schedule("* * * * *", async () => {
    console.log("檢查提醒...");
    checkReminders();

    // 檢查股市提醒（含單字第二頁）
    await stockReminder.checkStockReminderSchedules(client);

    // 檢查遊戲監控
    await gameMonitor.checkGameMonitors(client);
  });

  // 啟動時也檢查一次
  checkReminders();
});

const LOGIN_RETRY_MS = 10000;

async function loginWithRetry() {
  while (true) {
    try {
      await client.login(process.env.DISCORD_TOKEN);
      return;
    } catch (error) {
      if (error?.code !== "EAI_AGAIN") {
        throw error;
      }
      console.error("⚠️ Discord DNS 解析失敗，準備重試:", error.message);
      await new Promise((resolve) => setTimeout(resolve, LOGIN_RETRY_MS));
    }
  }
}

loginWithRetry().catch((error) => {
  console.error("❌ 機器人啟動失敗:", error);
  process.exit(1);
});
