# Discord 提醒機器人 v2.2

一個功能強大的Discord提醒機器人，支持重複提醒、時區管理、權限控制、每日日文單字學習、遊戲時間監控等功能。

## 🐳 快速部署（Docker）

**推薦使用 Docker 部署！** 只需 3 個指令即可在任何支援 Docker 的平台上執行：

```bash
# 1. 建立目錄並下載配置檔案
mkdir -p ~/discord-bot && cd ~/discord-bot
wget https://raw.githubusercontent.com/HeyLoon/discord-reminder-bot/main/docker-compose.prod.yml -O docker-compose.yml
wget https://raw.githubusercontent.com/HeyLoon/discord-reminder-bot/main/.env.docker -O .env

# 2. 編輯 .env 填入您的 Discord tokens
nano .env

# 3. 啟動機器人
docker compose pull && docker compose up -d
```

**支援架構**：
- ✅ linux/amd64 (Intel/AMD 伺服器)
- ✅ linux/arm64 (Orange Pi 5 Plus, Raspberry Pi 4/5, AWS Graviton)

**完整 Docker 部署指南**: 請參閱 [README-DOCKER.md](README-DOCKER.md)

---

## 📝 目錄

- [快速部署（Docker）](#-快速部署docker)
- [功能特色](#-功能特色)
- [傳統安裝步驟](#-安裝步驟)（不使用 Docker）
- [使用指南](#-使用指南)
- [更新日誌](#-更新日誌)

---

## ✨ 功能特色

### 🕹️ 提醒管理
- **一次性提醒** - 設置特定日期時間的提醒
- **重複提醒** - 支持每小時/每天/每週/每月/每年的重複提醒
- **自定義外觀** - 自定義標題、顏色、圖片、縮圖、底部文字
- **跳過日期** - 可設置跳過特定星期幾
- **過期設置** - 設置重複提醒的總次數
- **編輯功能** - 隨時編輯已創建的提醒
- **DST調整** - 支持夏令時時間調整

### 📚 每日日文單字
- **整合第二頁** - 透過股市提醒訊息的按鈕切換到單字頁
- **豐富內容** - 包含單字、假名、英文翻譯、詞性、JLPT等級、例句
- **純文字卡片** - 取消圖片顯示，內容更精簡
- **JLPT分級** - 支持N5/N4/N3/N2/N1或全部等級
- **進階難度優化** - N1/N2/N3 會優先挑選更進階、較不基礎的詞彙
- **避免重複** - 智能記錄已發送單字，避免短期內重複
- **歷史記錄** - 查看最近發送的單字列表

### 📈 每日股市提醒
- **每日固定發送** - 每天早上定時推送財經提醒（預設 08:30）
- **單一訊息雙頁** - 同一則訊息可按鈕換頁（第1頁股市 / 第2頁單字）
- **股市頁內容** - 固定風險提醒 + 國際時事(精簡列表) / 指數焦點(emoji漲跌，含日經與上證) / 前一交易日台股收盤
- **容錯機制** - 新聞抓取失敗時仍會發送固定提醒內容
- **快速測試** - 可使用 `send-now` 立即測試提醒內容

### 🎮 遊戲時間監控
- **多遊戲監控** - 同時監控同一成員的多個不同遊戲
- **模糊比對** - 使用關鍵字智能匹配遊戲名稱（不區分大小寫）
- **時間累積** - 30分鐘寬限期，短暫休息後繼續累計時間
- **自動提醒** - 達到時限後自動在頻道發送提醒
- **啟用/停用** - 可隨時啟用或停用監控，支援批次操作
- **即時狀態** - 查看成員當前遊玩狀態和累積時間

### 🌎 時區設置
- 為每個伺服器設置獨立時區
- 支持全球所有時區
- 自動根據時區計算提醒時間

### 👥 權限管理
- 基於角色的權限控制
- 管理員始終有完整權限
- 可添加/移除staff角色

## 📦 安裝步驟（傳統方式）

> **提示**: 如果您已使用 Docker 部署，可以跳過此章節。

### 1. 安裝依賴
```bash
cd discord-reminder-bot
npm install
```

### 2. 設置Discord機器人

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 創建新應用並添加機器人
3. **⚠️ 重要：啟用 Privileged Gateway Intents**
   - 進入 Bot 頁面
   - 向下滾動到 "Privileged Gateway Intents" 區域
   - 勾選以下選項：
     - ✅ **Presence Intent** (用於遊戲監控功能)
     - ✅ **Server Members Intent** (用於遊戲監控功能)
   - 點擊 "Save Changes"
4. 複製以下信息：
   - **Bot Token**: 在 Bot 頁面點擊 "Reset Token" 並複製
   - **Application ID**: 在 General Information 頁面的 "APPLICATION ID"
5. 在 OAuth2 > URL Generator 中勾選:
   - Scopes: `bot` 和 `applications.commands`
   - Bot Permissions: Send Messages, Embed Links, Use Slash Commands
6. 使用生成的URL邀請機器人到你的伺服器

**⚠️ 注意：** 如果沒有啟用 Presence Intent 和 Server Members Intent，遊戲監控功能將無法正常運作。

### 3. 獲取伺服器ID

1. 在Discord中開啟開發者模式 (用戶設置 > 進階 > 開發者模式)
2. 右鍵點擊伺服器圖標
3. 點擊 "複製伺服器ID"

### 4. 配置環境變數

創建 `.env` 文件（可以複製 `.env.example`）：
```bash
DISCORD_TOKEN=你的Discord機器人Token
CLIENT_ID=你的機器人Application ID
GUILD_ID=你的Discord伺服器ID
```

### 5. 註冊斜線指令

**重要：指令註冊只需要執行一次，不要重複執行！**

**方法1: 伺服器級別註冊（推薦，立即生效）**
```bash
npm run deploy-guild
```

**方法2: 全局註冊（需要最多1小時生效）**
```bash
npm run deploy
```

⚠️ **注意：** 
- 指令註冊成功後，不需要每次啟動機器人都重新註冊
- 只有在修改指令定義後才需要重新註冊
- 如果看到重複的指令，請執行 `npm run clear` 然後重新註冊

### 6. 啟動機器人
```bash
npm start
```

機器人啟動後會顯示提示信息，不會自動註冊指令。

## 📖 指令使用指南

### 🕹️ 提醒管理指令

#### `/reminder add` - 添加提醒
創建新的提醒，支持豐富的自定義選項和智能預設值。

**必填參數:**
- `用戶` - 要提醒的用戶
- `內容` - 提醒內容

**時間參數（可選，支持智能預設）:**
- `時間` - 時間 (格式: HH:mm 或 H:m，例如: 14:30, 1:1, 01:05，預設當前時間)
- `日期` - 日期 (格式: YYYY-MM-DD，例如: 2026-02-15，預設今天)

**其他可選參數:**
- `頻道` - 發送提醒的頻道（不指定則使用當前頻道）
- `重複` - 是否重複提醒
- `重複間隔` - 每小時/每天/每週/每月/每年
- `提及用戶` - 是否@用戶（預設是）
- `標題` - 自定義標題
- `顏色` - Embed顏色（hex格式，例如: #FF0000）
- `圖片` - 圖片URL
- `縮圖` - 縮圖URL
- `底部文字` - 底部文字
- `顯示時間戳` - 是否顯示時間戳
- `過期次數` - 重複提醒的總次數（不設置則無限重複）
- `跳過星期` - 跳過的星期幾（0-6，用逗號分隔，0=週日）

**智能預設說明:**
- 不填任何時間 = 立即提醒（當前時間）
- 只填時間 `01:01` 或 `1:1` = 今天 01:01
- 只填日期 `2026-03-15` = 該日期的當前時間
- 填時間+日期 = 指定的完整時間
- ⚠️ **非重複提醒不允許設定過去的時間**（會被拒絕創建）
- ✅ 重複提醒允許設定過去的時間（會自動跳到下一次執行時間）

**使用範例:**
```
# 立即提醒（當前時間）
/reminder add 用戶:@使用者 內容:測試提醒

# 今天14:30提醒
/reminder add 用戶:@使用者 內容:下午會議 時間:14:30

# 今天凌晨1點1分提醒（支持簡短格式）
/reminder add 用戶:@使用者 內容:半夜提醒 時間:1:1

# 2026-02-15的當前時間提醒
/reminder add 用戶:@使用者 內容:重要日期 日期:2026-02-15

# 完整指定時間
/reminder add 用戶:@使用者 內容:會議提醒 日期:2026-02-15 時間:14:30

# 每天早上9點提醒
/reminder add 用戶:@使用者 內容:每日站會 時間:09:00 重複:true 重複間隔:每天
```

#### `/reminder remove` - 刪除提醒
根據ID刪除提醒。
```
/reminder remove id:1234567890
```

#### `/reminder list` - 查看提醒列表
顯示所有活躍的提醒。
```
/reminder list
```

#### `/reminder edit` - 編輯提醒
修改已存在的提醒。
```
/reminder edit id:1234567890 時間:2026-03-01 15:00
/reminder edit id:1234567890 內容:新的提醒內容
```

#### `/reminder customize` - 自定義機器人外觀
設置自定義用戶名和頭像（僅管理員）。
```
/reminder customize 用戶名:提醒小助手 頭像:https://example.com/avatar.png
```

#### `/reminder dst-forward` - 夏令時向前調整
將所有提醒時間向前調整1小時（僅管理員）。
```
/reminder dst-forward
```

#### `/reminder dst-backward` - 夏令時向後調整
將所有提醒時間向後調整1小時（僅管理員）。
```
/reminder dst-backward
```

### 🌎 時區設置指令

#### `/settings timezone set` - 設置時區
為伺服器設置時區（僅管理員）。
```
/settings timezone set 時區:Asia/Taipei
/settings timezone set 時區:America/New_York
/settings timezone set 時區:Europe/London
```

**常用時區:**
- `Asia/Taipei` - 台北
- `Asia/Shanghai` - 上海
- `Asia/Tokyo` - 東京
- `America/New_York` - 紐約
- `America/Los_Angeles` - 洛杉磯
- `Europe/London` - 倫敦
- `Australia/Sydney` - 雪梨

#### `/settings timezone view` - 查看時區
查看當前伺服器的時區設置。
```
/settings timezone view
```

### 👥 權限角色管理指令

#### `/settings staff_role add` - 添加權限角色
給指定角色添加使用機器人的權限（僅管理員）。
```
/settings staff_role add 角色:@管理團隊
```

#### `/settings staff_role remove` - 移除權限角色
移除角色的使用權限（僅管理員）。
```
/settings staff_role remove 角色:@管理團隊
```

#### `/settings staff_role list` - 列出權限角色
查看所有有權限使用機器人的角色。
```
/settings staff_role list
```

### 📚 每日日文單字指令

### 📈 整合提醒指令（股市 + 單字）

#### `/stock-reminder setup` - 設置整合提醒功能
設置每日整合提醒的基本配置（僅管理員/權限角色）。提醒會發送為單一訊息，透過按鈕切換股市/單字頁。

**參數:**
- `頻道` (必填) - 發送提醒的頻道
- `時間` (可選) - 發送時間，格式 HH:mm，預設 08:30
- `難度` (可選) - 單字頁 JLPT 等級，預設全部等級
- `用戶` (可選) - 要提及的用戶

**範例:**
```
# 基本設置
/stock-reminder setup 頻道:#finance 時間:08:30 難度:n3

# 完整設置（包含提及用戶）
/stock-reminder setup 頻道:#market-watch 時間:08:30 難度:all 用戶:@交易小組
```

設置完成後會立即發送一則測試提醒，確認配置正確。

#### `/stock-reminder send-now` - 立即發送提醒
立即發送一則財經提醒，用於測試功能（僅管理員/權限角色）。
```
/stock-reminder send-now
```

#### `/stock-reminder status` - 查看狀態
查看當前整合提醒功能的配置和統計資訊（所有人可用）。
```
/stock-reminder status
```

#### `/stock-reminder history` - 查看單字歷史
查看最近發送的 10 個單字（所有人可用）。
```
/stock-reminder history
```

#### `/stock-reminder reset-history` - 清空單字歷史
清空單字歷史記錄，單字會重新開始循環（僅管理員/權限角色）。
```
/stock-reminder reset-history
```

#### `/stock-reminder toggle` - 開啟/關閉
開啟或關閉整合提醒功能（僅管理員/權限角色）。
```
/stock-reminder toggle
```

### 🎮 遊戲時間監控指令

遊戲時間監控功能可以追蹤成員的遊戲時間，當達到設定的時限時自動發送提醒。

**⚠️ 前置需求：** 必須在 Discord Developer Portal 啟用 **Presence Intent** 和 **Server Members Intent**，否則此功能無法運作。

#### `/game-monitor start` - 開始監控
開始監控特定成員的遊戲時間（僅管理員/權限角色）。

**參數:**
- `member` (必填) - 要監控的成員
- `time` (必填) - 時間限制（分鐘，範圍 1-480）
- `keyword` (可選) - 遊戲關鍵字（不填則使用成員當前遊戲）

**範例:**
```
# 監控成員當前遊玩的遊戲，限制2小時
/game-monitor start member:@小明 time:120

# 使用關鍵字監控特定遊戲
/game-monitor start member:@小華 time:90 keyword:league

# 監控多個遊戲（分別設定）
/game-monitor start member:@小美 time:120 keyword:valorant
/game-monitor start member:@小美 time:60 keyword:apex
```

**運作方式:**
- 如果成員當下正在玩匹配的遊戲，會立即開始計時
- 使用模糊比對，關鍵字 "league" 可以匹配 "League of Legends"
- 監控建立後預設為啟用狀態

#### `/game-monitor stop` - 刪除監控
永久刪除監控設定（僅管理員/權限角色）。

**參數:**
- `member` (必填) - 要停止監控的成員
- `keyword` (可選) - 遊戲關鍵字（不填則列出成員所有監控）

**範例:**
```
# 刪除特定遊戲的監控
/game-monitor stop member:@小明 keyword:league

# 列出成員所有監控（讓你選擇要刪除哪個）
/game-monitor stop member:@小華
```

#### `/game-monitor enable` - 啟用監控
啟用已停用的監控，會重置累積時間為 0（僅管理員/權限角色）。

**參數:**
- `member` (必填) - 要啟用監控的成員
- `keyword` (可選) - 遊戲關鍵字（不填則啟用該成員所有監控）

**範例:**
```
# 啟用特定遊戲的監控
/game-monitor enable member:@小明 keyword:valorant

# 批次啟用該成員所有監控
/game-monitor enable member:@小華
```

**重要：** 啟用時會將累積時間重置為 0，等於重新開始監控。

#### `/game-monitor disable` - 停用監控
停用監控並清空累積時間，監控設定保留但不再追蹤時間（僅管理員/權限角色）。

**參數:**
- `member` (必填) - 要停用監控的成員
- `keyword` (可選) - 遊戲關鍵字（不填則停用該成員所有監控）

**範例:**
```
# 停用特定遊戲的監控
/game-monitor disable member:@小明 keyword:league

# 批次停用該成員所有監控
/game-monitor disable member:@小華
```

**停用 vs 刪除的差別:**
- **停用 (disable)**: 保留設定但不追蹤，累積時間歸零，可隨時重新啟用
- **刪除 (stop)**: 完全移除監控設定，無法復原

#### `/game-monitor status` - 查看狀態
查看監控狀態和即時遊玩時間（所有人可用）。

**參數:**
- `member` (可選) - 要查看的成員（不填則查看自己）

**範例:**
```
# 查看自己的監控狀態
/game-monitor status

# 查看特定成員的監控狀態
/game-monitor status member:@小明
```

**顯示內容:**
- 遊戲名稱和關鍵字
- 時間限制
- 當前累積遊玩時間（即時更新）
- 監控狀態（啟用/停用）
- 是否正在遊玩

#### `/game-monitor list` - 列出所有監控
列出伺服器內所有監控設定（所有人可用）。

**範例:**
```
/game-monitor list
```

**顯示內容:**
- 依成員分組顯示
- 每個監控的遊戲、時限、狀態
- 統計總數和啟用/停用數量

### 🎮 遊戲監控運作機制

#### 模糊比對
使用關鍵字進行不區分大小寫的部分匹配：
- 關鍵字 "league" → 可匹配 "League of Legends"
- 關鍵字 "valorant" → 可匹配 "VALORANT"
- 關鍵字 "原神" → 可匹配 "原神" 或 "Genshin Impact"

#### 寬限期機制（30分鐘）
避免短暫休息就重置時間：

**情境 A - 短暫休息（時間累積）:**
```
09:00 - 開始玩 League of Legends
10:00 - 停止遊玩（已玩 1 小時）
10:15 - 再次開始玩 League of Legends
       → 從 1 小時繼續累積！
```

**情境 B - 長時間休息（時間重置）:**
```
09:00 - 開始玩 League of Legends
10:00 - 停止遊玩（已玩 1 小時）
11:00 - 再次開始玩 League of Legends
       → 已超過 30 分鐘寬限期，時間歸零重新計算！
```

#### 提醒機制
- 達到時限後，在建立監控時指定的頻道發送提醒
- 每個遊戲階段只提醒一次（不會重複騷擾）
- 成員停止遊玩後，下次再玩時可再次提醒
- 提醒訊息會 @ 提及該成員

#### 多遊戲獨立追蹤
每個遊戲的監控完全獨立：
```
範例：小明同時被監控兩個遊戲
  - League of Legends: 限制 2 小時
  - Valorant: 限制 1 小時

小明玩 League 1小時 → 不會影響 Valorant 的計時
```

## 🎯 使用場景範例

### 場景1: 今天下午的會議提醒
```
/reminder add 
  用戶:@團隊成員 
  時間:14:30
  內容:今天下午的產品會議
```

### 場景2: 每天早上9點站會
```
/reminder add 
  用戶:@團隊成員 
  時間:09:00
  內容:每日站會時間
  重複:true 
  重複間隔:每天
  標題:📅 每日站會
  顏色:#5865F2
```

### 場景3: 工作日提醒（跳過週末）
```
/reminder add 
  用戶:@員工 
  時間:10:00
  內容:檢查項目進度
  重複:true 
  重複間隔:每天
  跳過星期:0,6
```

### 場景4: 指定日期的提醒
```
/reminder add 
  用戶:@負責人 
  日期:2026-02-28
  時間:20:00
  內容:月度報告截止日
  標題:📊 月度總結
```

### 場景5: 立即提醒
```
/reminder add 
  用戶:@活動參與者 
  內容:快來參加活動！
```

### 場景6: 監控成員遊戲時間
```
# 基本監控
/game-monitor start 
  member:@學生
  time:120
  keyword:league

# 多個遊戲分別設限
/game-monitor start member:@玩家 time:120 keyword:valorant
/game-monitor start member:@玩家 time:90 keyword:apex

# 暫時停用監控（保留設定）
/game-monitor disable member:@玩家

# 批次重新啟用
/game-monitor enable member:@玩家
```

## ⚙️ 配置說明

### 權限系統
- **管理員**: 擁有所有權限，包括設置時區、管理權限角色
- **Staff角色**: 可以創建、編輯、刪除提醒
- **普通用戶**: 無權限

### 時區處理
- 每個伺服器可設置獨立時區
- 提醒時間會根據伺服器時區自動調整
- 默認時區: Asia/Taipei

### 數據存儲
- `reminders.json` - 存儲所有提醒數據
- `config.json` - 存儲伺服器配置（時區、權限角色等）
- `word-config.json` - 存儲每日單字功能配置
- `word-history.json` - 存儲已發送單字歷史記錄
- `stock-config.json` - 存儲股市提醒功能配置
- `game-monitor.json` - 存儲遊戲監控配置和狀態

### 遊戲監控設置
- **寬限期**: 30 分鐘（固定）
- **時限範圍**: 1-480 分鐘（8小時）
- **比對方式**: 模糊匹配（不區分大小寫，部分比對）
- **提醒頻率**: 每個遊戲階段只提醒一次
- **需要權限**: Presence Intent 和 Server Members Intent

## 🔧 技術棧

- **Node.js** - 運行環境
- **discord.js v14** - Discord API
- **moment-timezone** - 時區處理
- **node-cron** - 定時任務
- **dotenv** - 環境變數管理
- **unofficial-jisho-api** - 日文單字資料
- **axios** - HTTP 請求（Unsplash API）

## ❓ 常見問題

### 斜線指令相關

**Q: 看不到斜線指令?**  
A: 請按照以下步驟解決：
1. 確保在 `.env` 中設置了 `CLIENT_ID` 和 `GUILD_ID`
2. 執行 `npm run deploy-guild` 註冊指令
3. 等待幾秒鐘，指令應該會立即出現

**Q: 更新指令後介面沒有變化?**  
A: 執行以下步驟強制更新：
```bash
npm run clear        # 清除所有舊指令
npm run deploy-guild # 重新註冊指令到伺服器（立即生效）
```

**Q: 指令出現重複了怎麼辦?**  
A: 這是因為多次執行了註冊腳本。解決方法：
```bash
npm run clear        # 清除所有指令
npm run deploy-guild # 只註冊一次
```
記住：指令註冊只需要執行一次！機器人啟動時不會自動註冊。

**Q: 全局指令和伺服器指令有什麼區別?**  
A: 
- **伺服器指令** (`npm run deploy-guild`): 立即生效，僅在指定伺服器可用
- **全局指令** (`npm run deploy`): 需要最多1小時生效，所有伺服器都可用

### 提醒功能相關

**Q: 提醒沒有按時發送?**  
A: 檢查伺服器時區設置是否正確，使用 `/settings timezone view` 查看。

**Q: 如何設置工作日提醒?**  
A: 使用 `跳過星期:0,6` 參數跳過週末（0=週日, 6=週六）。

**Q: 如何停止重複提醒?**  
A: 使用 `/reminder remove` 刪除該提醒，或在創建時設置 `過期次數`。

**Q: 時間格式是什麼?**  
A: 
- **時間**: 使用 `HH:mm` 格式，例如: `14:30` 或 `01:05`（24小時制）
- **日期**: 使用 `YYYY-MM-DD` 格式，例如: `2026-02-15`
- **智能預設**: 不填寫則使用當前時間或今天的日期

### 每日單字功能相關

**Q: 如何設置每日單字功能?**  
A: 使用 `/stock-reminder setup` 設定整合提醒，並透過 `難度` 參數調整單字等級。

**Q: 單字會重複嗎?**  
A: 系統會記錄最近 500 個已發送的單字，避免短期內重複。當所有單字都發送過後，會自動清空歷史記錄重新開始。

**Q: 單字頁為什麼沒有圖片?**  
A: 目前設計為純文字卡片，固定不顯示圖片。

**Q: 如何更改發送時間或難度等級?**  
A: 重新執行 `/stock-reminder setup` 指令即可更新配置。

**Q: 單字發送失敗了怎麼辦?**  
A: 系統會自動重試 3 次。如果仍失敗會靜默跳過，隔天會重新嘗試。可以使用 `/stock-reminder send-now` 手動發送。

**Q: 可以一天發送多個單字嗎?**  
A: 目前只支持每天定時發送一個單字，但可以使用 `/stock-reminder send-now` 手動發送額外的一則整合提醒。

**Q: 如何暫時停止每日單字?**  
A: 使用 `/stock-reminder toggle` 指令可以快速開啟或關閉整合提醒。

**Q: 例句是日文還是中文?**  
A: 例句包含：
- 日文原文
- 羅馬拼音（假名轉寫）
- 英文翻譯

### 遊戲監控功能相關

**Q: 遊戲監控功能無法運作?**  
A: 請確認以下事項：
1. 在 Discord Developer Portal 啟用了 **Presence Intent** 和 **Server Members Intent**
2. 機器人已重新啟動（修改 Intents 後需要重啟）
3. 成員的遊戲狀態是公開的（不是隱形/離線狀態）

**Q: 如何使用關鍵字?**  
A: 關鍵字使用模糊比對，不區分大小寫：
- "league" 可匹配 "League of Legends"
- "valorant" 可匹配 "VALORANT" 或 "Valorant"
- 建議使用遊戲名稱的關鍵部分，避免太短（如單個字母）

**Q: 寬限期是什麼?**  
A: 寬限期為 30 分鐘，讓短暫休息後繼續遊玩時，時間可以累積而不是重置：
- 停止遊玩 10 分鐘後繼續 → 時間累積
- 停止遊玩 40 分鐘後繼續 → 時間重置

**Q: 可以監控隱形狀態的成員嗎?**  
A: 不行。Discord 不會向機器人提供隱形或離線成員的活動資訊。

**Q: 停用和刪除有什麼區別?**  
A: 
- **停用 (disable)**: 保留設定但停止追蹤，累積時間歸零，可以重新啟用
- **刪除 (stop)**: 完全移除監控，需要重新建立

**Q: 啟用監控時為什麼會重置時間?**  
A: 這是設計上的決定，讓重新啟用時有一個明確的「重新開始」，避免累積舊的遊玩時間造成混淆。

**Q: 可以監控多個遊戲嗎?**  
A: 可以！每個成員可以同時被監控多個不同遊戲，每個遊戲有獨立的時限和計時。

**Q: 提醒會不會一直重複發送?**  
A: 不會。每個遊戲階段只會提醒一次。成員停止遊玩後，下次再玩才會再次提醒（如果又達到時限）。

**Q: 機器人重啟後監控還在嗎?**  
A: 監控設定會保留。但如果重啟時成員正在遊玩，累積時間會從重啟時刻重新開始計算。

## 🛠️ 指令管理腳本

專案包含以下腳本來管理斜線指令：

| 指令 | 說明 |
|------|------|
| `npm run deploy-guild` | 註冊指令到指定伺服器（立即生效，推薦） |
| `npm run deploy` | 註冊全局指令（需要1小時生效） |
| `npm run clear` | 清除所有已註冊的指令 |
| `npm start` | 啟動機器人 |

## 📝 更新日誌

### v2.2 (最新)
- 🎮 **新增遊戲時間監控功能**
  - 追蹤成員的遊戲時間，達到時限自動提醒
  - 支援多遊戲獨立監控（同一成員可監控多個遊戲）
  - 模糊比對遊戲名稱（關鍵字匹配，不區分大小寫）
  - 30分鐘寬限期機制（短暫休息時間可累積）
  - 啟用/停用功能，支援批次操作
  - 即時狀態查詢和累積時間追蹤
  - 完整的管理指令（start, stop, enable, disable, status, list）
- ⚙️ 新增 Presence Intent 和 Server Members Intent 支援
- 🔧 presenceUpdate 事件處理整合

### v2.1
- 📚 **新增每日日文單字功能**
  - 自動發送每日日文單字到指定頻道
  - 包含單字、假名、英文翻譯、詞性、JLPT等級、例句
  - 支持 JLPT N5/N4/N3/N2/N1 等級分類
  - 配有精美圖片的Embed卡片（可選，需要 Unsplash API）
  - 智能避免重複（記錄最近 500 個單字）
  - 完整的管理指令（setup, status, toggle, history, reset-history）
- 🔧 整合 unofficial-jisho-api 和 Unsplash API
- ⏰ 每日單字定時檢查整合到現有 cron 系統

### v2.0
- ✨ 添加重複提醒功能（每小時/每天/每週/每月/每年）
- 🌍 添加時區管理系統
- 👥 添加基於角色的權限管理
- 🎨 支持自定義Embed外觀（顏色、圖片、標題等）
- 📅 支持跳過特定星期幾
- ⏰ 支持設置重複次數限制
- 🕐 添加夏令時調整功能
- 📝 添加提醒編輯功能
- 🔧 移除啟動時自動註冊指令，避免重複

### v1.0
- 基礎提醒功能
- 斜線指令支持

## 📄 License

MIT

---

**享受使用！如有問題歡迎反饋。** 🎉
