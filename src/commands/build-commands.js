const { SlashCommandBuilder } = require('discord.js');

function buildCommands() {
    return [
        // Reminder Management
        new SlashCommandBuilder()
            .setName('reminder')
            .setDescription('提醒管理')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('添加新提醒')
                    .addUserOption(option => option.setName('用戶').setDescription('要提醒的用戶').setRequired(true))
                    .addStringOption(option => option.setName('內容').setDescription('提醒內容').setRequired(true))
                    .addStringOption(option => option.setName('時間').setDescription('時間 (格式: HH:mm 或 H:m，例如: 14:30, 1:1，預設當前時間)').setRequired(false))
                    .addStringOption(option => option.setName('日期').setDescription('日期 (格式: YYYY-MM-DD，例如: 2026-02-15，預設今天)').setRequired(false))
                    .addChannelOption(option => option.setName('頻道').setDescription('發送提醒的頻道').setRequired(false))
                    .addBooleanOption(option => option.setName('重複').setDescription('是否重複提醒').setRequired(false))
                    .addStringOption(option =>
                        option.setName('重複間隔')
                            .setDescription('重複間隔')
                            .addChoices(
                                { name: '每小時', value: 'hourly' },
                                { name: '每天', value: 'daily' },
                                { name: '每週', value: 'weekly' },
                                { name: '每月', value: 'monthly' },
                                { name: '每年', value: 'yearly' }
                            )
                            .setRequired(false))
                    .addBooleanOption(option => option.setName('提及用戶').setDescription('是否在提醒時@用戶').setRequired(false))
                    .addStringOption(option => option.setName('標題').setDescription('自定義標題').setRequired(false))
                    .addStringOption(option => option.setName('顏色').setDescription('Embed顏色 (hex格式，例如: #FF0000)').setRequired(false))
                    .addStringOption(option => option.setName('圖片').setDescription('圖片URL').setRequired(false))
                    .addStringOption(option => option.setName('縮圖').setDescription('縮圖URL').setRequired(false))
                    .addStringOption(option => option.setName('底部文字').setDescription('底部文字').setRequired(false))
                    .addBooleanOption(option => option.setName('顯示時間戳').setDescription('是否顯示時間戳').setRequired(false))
                    .addIntegerOption(option => option.setName('過期次數').setDescription('重複提醒的總次數').setRequired(false))
                    .addStringOption(option => option.setName('跳過星期').setDescription('跳過的星期 (0-6，用逗號分隔，0=週日)').setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('刪除提醒')
                    .addIntegerOption(option => option.setName('id').setDescription('提醒ID').setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('查看所有提醒'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('edit')
                    .setDescription('編輯提醒')
                    .addIntegerOption(option => option.setName('id').setDescription('提醒ID').setRequired(true))
                    .addStringOption(option => option.setName('時間').setDescription('新的提醒時間').setRequired(false))
                    .addStringOption(option => option.setName('內容').setDescription('新的提醒內容').setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('customize')
                    .setDescription('自定義機器人外觀')
                    .addStringOption(option => option.setName('用戶名').setDescription('自定義用戶名').setRequired(false))
                    .addStringOption(option => option.setName('頭像').setDescription('自定義頭像URL').setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('dst-forward')
                    .setDescription('將所有提醒時間向前調整1小時（夏令時）'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('dst-backward')
                    .setDescription('將所有提醒時間向後調整1小時（夏令時）')),

        // Settings
        new SlashCommandBuilder()
            .setName('settings')
            .setDescription('設置管理')
            .addSubcommandGroup(group =>
                group
                    .setName('timezone')
                    .setDescription('時區設置')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('set')
                            .setDescription('設置時區')
                            .addStringOption(option =>
                                option.setName('時區')
                                    .setDescription('時區 (例如: Asia/Taipei, America/New_York)')
                                    .setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('view')
                            .setDescription('查看當前時區')))
            .addSubcommandGroup(group =>
                group
                    .setName('staff_role')
                    .setDescription('權限角色管理')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('add')
                            .setDescription('添加權限角色')
                            .addRoleOption(option => option.setName('角色').setDescription('要添加的角色').setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('remove')
                            .setDescription('移除權限角色')
                            .addRoleOption(option => option.setName('角色').setDescription('要移除的角色').setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('list')
                            .setDescription('列出所有權限角色'))),

        // Daily Word
        new SlashCommandBuilder()
            .setName('daily-word')
            .setDescription('每日日文單字功能')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('setup')
                    .setDescription('設置每日單字功能')
                    .addChannelOption(option =>
                        option.setName('頻道')
                            .setDescription('發送單字的頻道')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('時間')
                            .setDescription('發送時間 (格式: HH:mm，例如: 09:00，預設 09:00)')
                            .setRequired(false))
                    .addStringOption(option =>
                        option.setName('難度')
                            .setDescription('JLPT 難度等級')
                            .addChoices(
                                { name: '全部等級', value: 'all' },
                                { name: 'N5 (初級)', value: 'n5' },
                                { name: 'N4', value: 'n4' },
                                { name: 'N3 (中級)', value: 'n3' },
                                { name: 'N2', value: 'n2' },
                                { name: 'N1 (高級)', value: 'n1' }
                            )
                            .setRequired(false))
                    .addUserOption(option =>
                        option.setName('用戶')
                            .setDescription('要提及的用戶（可選）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('send-now')
                    .setDescription('立即發送一個隨機單字（測試用）'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('查看每日單字功能狀態'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('開啟/關閉每日單字功能'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('history')
                    .setDescription('查看最近發送的單字'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('reset-history')
                    .setDescription('清空單字歷史記錄（單字會重新開始循環）')),

        // Stock Reminder
        new SlashCommandBuilder()
            .setName('stock-reminder')
            .setDescription('股市財經提醒功能')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('setup')
                    .setDescription('設置股市提醒功能')
                    .addChannelOption(option =>
                        option.setName('頻道')
                            .setDescription('發送提醒的頻道')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('時間')
                            .setDescription('發送時間 (格式: HH:mm，例如: 08:30，預設 08:30)')
                            .setRequired(false))
                    .addUserOption(option =>
                        option.setName('用戶')
                            .setDescription('要提及的用戶（可選）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('send-now')
                    .setDescription('立即發送一則財經提醒（測試用）'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('查看股市提醒功能狀態'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('開啟/關閉股市提醒功能')),

        // Game Monitor
        new SlashCommandBuilder()
            .setName('game-monitor')
            .setDescription('遊戲時間監控管理')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('start')
                    .setDescription('開始監控成員的遊戲時間')
                    .addUserOption(option =>
                        option.setName('member')
                            .setDescription('要監控的成員')
                            .setRequired(true))
                    .addIntegerOption(option =>
                        option.setName('time')
                            .setDescription('時間限制（分鐘，1-480）')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(480))
                    .addStringOption(option =>
                        option.setName('keyword')
                            .setDescription('遊戲名稱關鍵字（不填則使用成員當前遊戲）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('stop')
                    .setDescription('永久刪除監控')
                    .addUserOption(option =>
                        option.setName('member')
                            .setDescription('要停止監控的成員')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('keyword')
                            .setDescription('遊戲關鍵字（不填則顯示成員所有監控）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('enable')
                    .setDescription('啟用監控（可批次操作，會重置累積時間）')
                    .addUserOption(option =>
                        option.setName('member')
                            .setDescription('要啟用監控的成員')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('keyword')
                            .setDescription('遊戲關鍵字（不填則啟用該成員所有監控）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('disable')
                    .setDescription('停用監控並清空累積時間（可批次操作）')
                    .addUserOption(option =>
                        option.setName('member')
                            .setDescription('要停用監控的成員')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('keyword')
                            .setDescription('遊戲關鍵字（不填則停用該成員所有監控）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('查看監控狀態')
                    .addUserOption(option =>
                        option.setName('member')
                            .setDescription('要查看的成員（不填則查看自己）')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('列出伺服器所有監控'))
    ];
}

module.exports = buildCommands;
