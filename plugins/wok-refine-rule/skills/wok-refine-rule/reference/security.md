# 安全规范

## 1. 敏感信息检测
- Commit 前自动扫描以下明文密钥模式：
  - API Keys: `sk-`, `api_key`, `apikey`, `secret_key`
  - Tokens: `Bearer `, `token=`, `access_token`
  - Passwords: `password=`, `passwd=`, `pwd=`
  - Private Keys: `-----BEGIN.*PRIVATE KEY-----`
- 检测到疑似密钥时：
  - 🚨 立即停止当前操作
  - ⚠️ 向用户发出明确警告
  - 📄 标注疑似密钥位置（文件:行号）
  - 🔧 建议使用环境变量或密钥管理服务

## 2. 安全响应格式
```
🚨 [SECURITY] 检测到疑似明文密钥
📄 位置: config.py:42
🔍 内容: api_key = "sk-xxxx..."
🔧 建议: 使用环境变量 API_KEY 或密钥管理服务
🚫 操作已中止，请确认后继续
```
