# 📱 移动设备摄像头问题解决指南

## 🔧 问题解决方案

### 1. HTTPS要求（最重要）

移动设备浏览器通常要求HTTPS才能访问摄像头。

**解决方案：**
```bash
# 启动HTTPS前端应用
cd frontend
npm run start:mobile
```

这将启动支持HTTPS的开发服务器。

### 2. 浏览器权限设置

**iOS Safari:**
1. 打开"设置" > "Safari" > "网站设置"
2. 找到"摄像头"和"麦克风"选项
3. 设置为"询问"或"允许"

**Android Chrome:**
1. 打开Chrome，访问网站
2. 点击地址栏左侧的锁图标或摄像头图标
3. 选择"允许"摄像头和麦克风权限

### 3. 网络访问

如果使用HTTPS，确保手机能访问您的电脑：

1. 获取电脑IP地址：
```bash
ifconfig | grep inet
```

2. 确保手机和电脑在同一WiFi网络

3. 在手机浏览器访问：`https://[您的IP]:3002`

## 🚀 启动指南

### 方案一：HTTPS启动（推荐）
```bash
# 启动后端（保持HTTP）
cd backend
go run main.go &

# 启动HTTPS前端
cd frontend
npm run start:mobile
```

### 方案二：本地网络HTTPS
```bash
# 生成自签名证书（首次使用）
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

# 启动HTTPS前端
cd frontend
npm run start:https
```

## 📋 问题排查清单

### ✅ 基础检查
- [ ] 手机浏览器是否为现代浏览器（Chrome、Safari、Firefox）
- [ ] 是否使用HTTPS访问网站
- [ ] 手机摄像头是否被其他应用占用
- [ ] 浏览器是否有摄像头和麦克风权限

### ✅ 网络检查
- [ ] 手机和电脑是否在同一WiFi
- [ ] 防火墙是否阻止了端口访问
- [ ] 是否能正常访问网站首页

### ✅ 浏览器检查
- [ ] 清除浏览器缓存和Cookie
- [ ] 重新授权摄像头权限
- [ ] 尝试无痕模式/隐私模式

## 🛠️ 常见错误及解决方案

### 错误1: "NotAllowedError"
**原因：** 权限被拒绝
**解决：** 重新设置浏览器权限，使用HTTPS

### 错误2: "NotFoundError" 
**原因：** 找不到摄像头设备
**解决：** 检查设备连接，重启摄像头应用

### 错误3: "NotReadableError"
**原因：** 设备被其他应用占用
**解决：** 关闭其他摄像头应用，重启浏览器

### 错误4: "Only secure origins are allowed"
**原因：** 必须使用HTTPS
**解决：** 使用 `npm run start:mobile` 启动HTTPS服务

## 📲 测试步骤

1. **启动HTTPS服务**
   ```bash
   cd frontend && npm run start:mobile
   ```

2. **获取访问地址**
   - 本地：`https://localhost:3002`
   - 网络：`https://[您的IP]:3002`

3. **手机访问测试**
   - 打开手机浏览器
   - 访问上述地址
   - 接受证书警告（自签名证书）
   - 测试摄像头权限

4. **权限授权**
   - 点击"允许"摄像头权限
   - 点击"允许"麦克风权限
   - 查看是否显示本地视频

## 💡 优化建议

1. **生产环境使用有效的SSL证书**
2. **配置STUN/TURN服务器用于NAT穿透**
3. **添加设备检测和切换功能**
4. **优化移动端UI适配**

## 🔍 调试技巧

1. **查看浏览器控制台**
   - 手机Chrome: 连接数据线，使用chrome://inspect
   - 手机Safari: 连接数据线，使用Safari开发菜单

2. **查看详细错误信息**
   - 应用已添加详细的错误提示
   - 根据错误信息按提示操作

3. **使用重试按钮**
   - 修复权限问题后点击"重新尝试"按钮
   - 无需刷新整个页面 