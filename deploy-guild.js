const { REST, Routes } = require('discord.js');
require('dotenv').config();
const buildCommands = require('./src/commands/build-commands');

const commands = buildCommands();
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

if (!process.env.GUILD_ID) {
    console.error('❌ 錯誤: 請在 .env 文件中設置 GUILD_ID');
    console.log('獲取伺服器ID的方法:');
    console.log('1. 在Discord中開啟開發者模式 (用戶設置 > 進階 > 開發者模式)');
    console.log('2. 右鍵點擊伺服器圖標');
    console.log('3. 點擊 "複製伺服器ID"');
    console.log('4. 將ID添加到 .env 文件: GUILD_ID=你的伺服器ID');
    process.exit(1);
}

// 註冊伺服器級別指令（立即生效）
(async () => {
    try {
        console.log('開始註冊伺服器級別斜線指令...');
        console.log(`伺服器ID: ${process.env.GUILD_ID}`);
        console.log(`總共 ${commands.length} 個指令`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log(`✅ 成功註冊 ${data.length} 個斜線指令到伺服器！`);
        console.log('指令列表:');
        data.forEach(cmd => {
            console.log(`  - /${cmd.name}`);
        });
        console.log('\n✅ 指令已立即生效！現在可以在你的伺服器中使用了。');
    } catch (error) {
        console.error('❌ 註冊指令時出錯:', error);
        if (error.code === 50001) {
            console.log('\n可能的原因:');
            console.log('- 機器人沒有被邀請到該伺服器');
            console.log('- GUILD_ID 不正確');
        }
    }
})();
