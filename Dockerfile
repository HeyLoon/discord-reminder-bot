# ============================================
# 階段 1: 依賴安裝
# ============================================
FROM node:25-alpine AS deps

WORKDIR /app

# 複製套件檔案
COPY package.json package-lock.json ./

# 安裝生產環境依賴
RUN npm ci --only=production && \
    npm cache clean --force

# ============================================
# 階段 2: 執行環境
# ============================================
FROM node:25-alpine AS runner

WORKDIR /app

# 安裝 dumb-init 以正確處理訊號
RUN apk add --no-cache dumb-init

# 建立非 root 使用者
RUN addgroup -g 1001 -S botuser && \
    adduser -S botuser -u 1001

# 從 deps 階段複製依賴
COPY --from=deps --chown=botuser:botuser /app/node_modules ./node_modules

# 複製應用程式碼
COPY --chown=botuser:botuser *.js ./
COPY --chown=botuser:botuser package.json ./
COPY --chown=botuser:botuser README.md ./

# 建立資料目錄供 volume 掛載使用
RUN mkdir -p /app/data && \
    chown -R botuser:botuser /app/data

# 切換到非 root 使用者
USER botuser

# 設定環境變數
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    TZ=Asia/Taipei

# 健康檢查（檢查 bot.js 程序是否執行中）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD pgrep -f "node bot.js" || exit 1

# 使用 dumb-init 正確處理訊號
ENTRYPOINT ["dumb-init", "--"]

# 啟動機器人
CMD ["node", "bot.js"]
