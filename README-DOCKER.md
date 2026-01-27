# Discord 提醒機器人 - Docker 部署指南

本指南將幫助您使用 Docker 容器化部署 Discord 提醒機器人。

## 目錄

- [前置需求](#前置需求)
- [快速開始](#快速開始)
- [環境變數配置](#環境變數配置)
- [資料持久化](#資料持久化)
- [從原始碼建置](#從原始碼建置)
- [多架構支援](#多架構支援)
- [更新機器人](#更新機器人)
- [監控與日誌](#監控與日誌)
- [常見問題排解](#常見問題排解)
- [安全最佳實踐](#安全最佳實踐)
- [備份與還原](#備份與還原)

---

## 前置需求

在開始之前，請確保您的系統已安裝：

- **Docker**：版本 20.10 或更高
- **Docker Compose**：版本 2.0 或更高（通常隨 Docker 一起安裝）

### 安裝 Docker（Ubuntu/Debian）

```bash
# 安裝 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 將您的使用者加入 docker 群組（可選，避免每次都要 sudo）
sudo usermod -aG docker $USER

# 登出並重新登入以套用群組變更

# 驗證安裝
docker --version
docker compose version
```

### 安裝 Docker（其他系統）

- **macOS**: 下載 [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
- **Windows**: 下載 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)

---

## 快速開始

### 方法 1：使用預建映像（推薦）

從 GitHub Container Registry 拉取並執行官方映像：

```bash
# 1. 建立專案目錄
mkdir -p ~/discord-bot
cd ~/discord-bot

# 2. 下載 docker-compose 配置檔案
wget https://raw.githubusercontent.com/HeyLoon/discord-reminder-bot/main/docker-compose.prod.yml -O docker-compose.yml

# 3. 下載環境變數範本
wget https://raw.githubusercontent.com/HeyLoon/discord-reminder-bot/main/.env.docker -O .env

# 4. 編輯環境變數（填入您的 Discord tokens）
nano .env

# 5. 啟動機器人
docker compose pull
docker compose up -d

# 6. 查看日誌確認啟動成功
docker compose logs -f
```

### 方法 2：從原始碼建置

```bash
# 1. Clone 專案
git clone https://github.com/HeyLoon/discord-reminder-bot.git
cd discord-reminder-bot

# 2. 複製環境變數範本
cp .env.docker .env

# 3. 編輯環境變數
nano .env

# 4. 建置並啟動
docker compose build
docker compose up -d

# 5. 查看日誌
docker compose logs -f
```

---

## 環境變數配置

編輯 `.env` 檔案並填入以下必要資訊：

### 必填變數

```env
# Discord 機器人 Token（必填）
# 取得位置：https://discord.com/developers/applications → 您的應用程式 → Bot → Token
DISCORD_TOKEN=your_discord_bot_token_here

# 機器人的 Application ID（必填）
# 取得位置：https://discord.com/developers/applications → 您的應用程式 → Application ID
CLIENT_ID=your_client_id_here

# Discord 伺服器（Guild）ID（必填）
# 取得方式：在 Discord 中開啟開發者模式，右鍵點擊伺服器圖示 → 複製 ID
GUILD_ID=your_guild_id_here
```

### 選填變數

```env
# Unsplash API 金鑰（選填，用於每日日文單字功能的圖片）
# 取得位置：https://unsplash.com/developers
UNSPLASH_ACCESS_KEY=

# 時區設定（選填，預設：Asia/Taipei）
TZ=Asia/Taipei
```

### Docker 專用變數（自動設定，無需修改）

```env
DATA_DIR=/app/data
NODE_ENV=production
```

---

## 資料持久化

機器人的所有資料（提醒、配置、歷史記錄）都儲存在 Docker volume 中，確保容器重啟後資料不會遺失。

### 檢查 Volume

```bash
# 列出所有 volumes
docker volume ls

# 檢視 bot-data volume 詳細資訊
docker volume inspect taobao-reminder-bot_bot-data
```

### Volume 內容

Volume 包含以下檔案：
- `reminders.json` - 所有提醒資料
- `config.json` - 伺服器配置
- `game-monitor.json` - 遊戲監控資料
- `word-config.json` - 每日單字配置
- `word-history.json` - 單字歷史記錄

---

## 從原始碼建置

### 本地建置（單一架構）

```bash
# 建置適合您當前系統的映像
docker build -t discord-reminder-bot:local .

# 使用本地建置的映像執行
docker run -d \
  --name discord-reminder-bot \
  --env-file .env \
  -v bot-data:/app/data \
  --restart unless-stopped \
  discord-reminder-bot:local
```

### 多架構建置（進階）

如果您想建置支援多架構的映像：

```bash
# 啟用 Docker buildx
docker buildx create --use

# 建置多架構映像
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t discord-reminder-bot:multi-arch \
  --load \
  .
```

---

## 多架構支援

本機器人的 Docker 映像支援以下架構：

- **linux/amd64** - 標準 x86_64 伺服器（Intel/AMD CPU）
- **linux/arm64** - ARM64 伺服器（如 Orange Pi 5 Plus、Raspberry Pi 4/5、AWS Graviton）

### Orange Pi 5 Plus (RK3588) 部署

您的 Orange Pi 5 Plus 使用 RK3588 處理器（ARM64 架構），可以直接使用預建映像：

```bash
# Docker 會自動選擇正確的架構
docker pull ghcr.io/heyloon/discord-reminder-bot:latest

# 查看映像架構
docker inspect ghcr.io/heyloon/discord-reminder-bot:latest | grep Architecture
# 應該顯示 "Architecture": "arm64"
```

---

## 更新機器人

### 更新到最新版本

```bash
cd ~/discord-bot

# 拉取最新映像
docker compose pull

# 重新啟動容器（無縫更新）
docker compose up -d

# 查看日誌確認更新成功
docker compose logs -f
```

### 更新到特定版本

編輯 `docker-compose.yml`，修改映像標籤：

```yaml
services:
  discord-bot:
    image: ghcr.io/heyloon/discord-reminder-bot:v2.2.0  # 指定版本
```

然後執行：

```bash
docker compose pull
docker compose up -d
```

### 可用版本標籤

- `latest` - 最新穩定版本（推薦）
- `v2.2.0` - 特定完整版本
- `v2.2` - 特定次要版本（會自動更新到 2.2.x 的最新版）
- `v2` - 特定主要版本（會自動更新到 2.x.x 的最新版）

---

## 監控與日誌

### 查看日誌

```bash
# 查看實時日誌
docker compose logs -f

# 查看最後 100 行日誌
docker compose logs --tail=100

# 查看特定時間範圍的日誌
docker compose logs --since="2024-01-28T10:00:00"

# 只查看錯誤日誌
docker compose logs | grep -i error
```

### 檢查容器狀態

```bash
# 查看容器執行狀態
docker compose ps

# 查看容器詳細資訊
docker inspect discord-reminder-bot

# 查看健康檢查狀態
docker inspect discord-reminder-bot | grep -A 10 Health
```

### 進入容器（偵錯用）

```bash
# 進入正在執行的容器
docker compose exec discord-bot sh

# 查看容器內的檔案
docker compose exec discord-bot ls -la /app/data
```

### 資源使用監控

```bash
# 查看 CPU 和記憶體使用情況
docker stats discord-reminder-bot

# 查看所有容器的資源使用
docker stats
```

---

## 常見問題排解

### 問題 1：機器人無法啟動

**檢查日誌**：
```bash
docker compose logs
```

**常見原因**：
- Token 錯誤：檢查 `.env` 中的 `DISCORD_TOKEN`
- 權限不足：確保機器人在 Discord Developer Portal 啟用了必要的 Intents（Presence、Server Members）
- 網路問題：檢查伺服器是否能連接到 Discord API

### 問題 2：資料遺失

**檢查 Volume**：
```bash
docker volume ls
docker volume inspect taobao-reminder-bot_bot-data
```

**解決方案**：
- 確保使用 `docker compose down` 而非 `docker compose down -v`（後者會刪除 volumes）
- 定期備份（見下方備份章節）

### 問題 3：容器一直重啟

**檢查重啟原因**：
```bash
docker logs discord-reminder-bot --tail=50
```

**常見原因**：
- 程式崩潰：檢查是否有 Node.js 錯誤
- 健康檢查失敗：等待 40 秒讓機器人完全啟動
- 資源不足：檢查 `docker stats` 確認記憶體是否足夠

### 問題 4：無法連接到 Discord

**檢查網路**：
```bash
# 在容器內測試網路連接
docker compose exec discord-bot ping -c 3 discord.com

# 檢查 DNS 解析
docker compose exec discord-bot nslookup discord.com
```

**解決方案**：
- 檢查防火牆設定
- 確認伺服器可以訪問外網
- 檢查 Docker 網路配置

### 問題 5：多架構映像無法拉取

如果在 ARM64 裝置上拉取映像失敗：

```bash
# 手動指定平台
docker pull --platform linux/arm64 ghcr.io/heyloon/discord-reminder-bot:latest
```

---

## 安全最佳實踐

### 1. 保護環境變數

```bash
# 設定 .env 檔案權限為僅擁有者可讀
chmod 600 .env

# 確認 .env 不被 git 追蹤
git ls-files .env  # 應該沒有輸出
```

### 2. 定期更新

```bash
# 定期更新到最新版本（每週或每月）
docker compose pull && docker compose up -d
```

### 3. 監控日誌

設定定期檢查日誌，注意異常活動：

```bash
# 查找錯誤
docker compose logs --since="24h" | grep -i error

# 查找警告
docker compose logs --since="24h" | grep -i warn
```

### 4. 限制資源使用

編輯 `docker-compose.yml` 新增資源限制：

```yaml
services:
  discord-bot:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
```

### 5. 使用非 root 使用者

容器已預設使用非 root 使用者 `botuser` (UID 1001) 執行，無需額外配置。

---

## 備份與還原

### 備份資料

#### 方法 1：備份整個 Volume

```bash
# 建立備份目錄
mkdir -p ~/backups

# 備份 volume 到 tar.gz
docker run --rm \
  -v taobao-reminder-bot_bot-data:/data \
  -v ~/backups:/backup \
  alpine tar czf /backup/bot-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# 查看備份檔案
ls -lh ~/backups/
```

#### 方法 2：備份特定檔案

```bash
# 複製資料目錄到本地
docker cp discord-reminder-bot:/app/data ~/backups/bot-data-$(date +%Y%m%d)

# 查看備份內容
ls -lh ~/backups/bot-data-*/
```

### 還原資料

#### 還原整個 Volume

```bash
# 停止機器人
docker compose down

# 還原備份（替換 backup-file.tar.gz 為您的備份檔名）
docker run --rm \
  -v taobao-reminder-bot_bot-data:/data \
  -v ~/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/bot-data-20240128-120000.tar.gz"

# 重新啟動
docker compose up -d
```

#### 還原特定檔案

```bash
# 複製特定檔案回容器
docker cp ~/backups/bot-data-20240128/reminders.json discord-reminder-bot:/app/data/

# 重啟機器人以載入資料
docker compose restart
```

### 自動化備份（建議）

建立 cron job 定期備份：

```bash
# 編輯 crontab
crontab -e

# 新增每日凌晨 2 點備份（保留最近 7 天）
0 2 * * * docker run --rm -v taobao-reminder-bot_bot-data:/data -v ~/backups:/backup alpine tar czf /backup/bot-data-$(date +\%Y\%m\%d).tar.gz -C /data . && find ~/backups -name "bot-data-*.tar.gz" -mtime +7 -delete
```

---

## 管理指令速查

```bash
# 啟動
docker compose up -d

# 停止
docker compose down

# 重啟
docker compose restart

# 查看日誌
docker compose logs -f

# 查看狀態
docker compose ps

# 拉取最新映像
docker compose pull

# 更新並重啟
docker compose pull && docker compose up -d

# 進入容器
docker compose exec discord-bot sh

# 查看資源使用
docker stats discord-reminder-bot

# 備份資料
docker run --rm -v taobao-reminder-bot_bot-data:/data -v $(pwd):/backup alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .

# 清理未使用的資源
docker system prune -a
```

---

## 技術規格

- **基礎映像**: `node:24-alpine`
- **映像大小**: ~150-200 MB（壓縮後）
- **支援架構**: amd64, arm64
- **執行使用者**: botuser (UID 1001)
- **資料目錄**: `/app/data`
- **健康檢查**: 每 30 秒檢查一次程序狀態
- **自動重啟**: 是（除非手動停止）
- **日誌輪替**: 最大 10MB，保留 3 個檔案

---

## 取得協助

如果您遇到問題：

1. **檢查日誌**: `docker compose logs -f`
2. **查看 GitHub Issues**: [https://github.com/HeyLoon/discord-reminder-bot/issues](https://github.com/HeyLoon/discord-reminder-bot/issues)
3. **建立新 Issue**: 提供詳細的錯誤訊息和系統資訊

---

## 授權

本專案採用 MIT 授權條款。詳見 LICENSE 檔案。
