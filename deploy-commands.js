const { REST, Routes } = require('discord.js');
require('dotenv').config();
const buildCommands = require('./src/commands/build-commands');

const commands = buildCommands();
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// 註冊指令
(async () => {
    try {
        console.log('開始註冊/更新斜線指令...');
        console.log(`總共 ${commands.length} 個指令`);

        // 全局註冊指令
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
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
