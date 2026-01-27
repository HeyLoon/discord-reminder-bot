const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('開始清除所有斜線指令...');

        // 清除全局指令
        console.log('\n清除全局指令...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log('✅ 全局指令已清除');

        // 清除伺服器指令（如果有設置GUILD_ID）
        if (process.env.GUILD_ID) {
            console.log('\n清除伺服器指令...');
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );
            console.log('✅ 伺服器指令已清除');
        }

        console.log('\n✅ 所有指令已清除完畢！');
        console.log('現在你可以重新運行 deploy-guild.js 或 deploy-commands.js 來註冊新指令。');
        
    } catch (error) {
        console.error('❌ 清除指令時出錯:', error);
    }
})();
