const { REST, Routes } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    // Reminder Management
    new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('提醒管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('添加新提醒')
                .addUserOption(option => option.setName('用戶').setDescription('要提醒的用戶').setRequired(true))
                .addStringOption(option => option.setName('時間').setDescription('提醒時間 (格式: YYYY-MM-DD HH:mm)').setRequired(true))
                .addStringOption(option => option.setName('內容').setDescription('提醒內容').setRequired(true))
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
                        .setDescription('列出所有權限角色')))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// 註冊指令
(async () => {
    try {
        console.log('開始註冊/更新斜線指令...');
        console.log(`總共 ${commands.length} 個指令`);

        // 全局註冊指令
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ 成功註冊 ${data.length} 個斜線指令！`);
        console.log('指令列表:');
        data.forEach(cmd => {
            console.log(`  - /${cmd.name}`);
        });
        console.log('\n注意: 全局指令可能需要最多1小時才會在所有伺服器中生效。');
        console.log('如果需要立即生效，請使用 deploy-guild.js 腳本進行伺服器級別註冊。');
        
    } catch (error) {
        console.error('❌ 註冊指令時出錯:', error);
    }
})();
