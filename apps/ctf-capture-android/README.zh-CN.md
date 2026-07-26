# NovaPay 收款监听 Android

这是 NovaPay 支付宝/微信收款通知监听 App：

- 在 App 界面填写 `baseUrl / accountId / token / collectorSecret`
- 监听支付宝或微信到账通知
- 使用独立 token 和 `collectorSecret` 上报到账事件
- 将到账事件与对应金额、通道和时间窗口内的订单进行匹配

## 功能

- 启动 session
- 模拟支付
- 拉取账单 envelope
- 解码账单 rows
- 回放第一条账单到 NovaPay
- 粘贴手工 JSON 再回放

## Release 安全设置

Release 构建默认启用：

- Android Keystore AES-256-GCM 加密 token 和 `collectorSecret`
- `debuggable=false`、`allowBackup=false`
- 仅允许 HTTPS，并且只信任系统 CA
- R8 混淆和反调试检查
- 移除详细 Logcat 日志

旧版 SharedPreferences 中的明文 token 和 `collectorSecret` 会在首次读取时自动迁移并删除。

### 当前 Release 签名

发布密钥保存在仓库外，密码保存在 macOS 钥匙串：

```text
keystore: ~/.novapay/keys/novapay-capture-release.p12
alias: novapay-capture-release
Keychain service: NovaPay Android Release Signing
```

后续版本必须继续使用这把密钥，否则 Android 无法覆盖安装已有 App。应将 `.p12` 另外做一份离线备份，不要放入 Git。

在当前 Mac 构建签名 Release：

```bash
SIGNING_PASSWORD="$(security find-generic-password \
  -a "$USER" \
  -s "NovaPay Android Release Signing" \
  -w)"

export NOVAPAY_ANDROID_KEYSTORE_FILE="$HOME/.novapay/keys/novapay-capture-release.p12"
export NOVAPAY_ANDROID_KEYSTORE_PASSWORD="$SIGNING_PASSWORD"
export NOVAPAY_ANDROID_KEY_ALIAS="novapay-capture-release"
export NOVAPAY_ANDROID_KEY_PASSWORD="$SIGNING_PASSWORD"

./gradlew :app:assembleRelease

unset SIGNING_PASSWORD \
  NOVAPAY_ANDROID_KEYSTORE_PASSWORD \
  NOVAPAY_ANDROID_KEY_PASSWORD
```

APK 输出位置：

```text
app/build/outputs/apk/release/app-release.apk
```

安装或覆盖更新：

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

## 导入方式

1. 用 Android Studio 打开目录：

```text
apps/ctf-capture-android
```

2. 复制一份本地 SDK 配置：

```bash
cp local.properties.example local.properties
```

3. 修改 `local.properties`：

```text
sdk.dir=/Users/<你的用户名>/Library/Android/sdk
```

4. 在 Android Studio 中 Sync / Run

## 生产参数

初始界面预填生产平台地址和当前支付宝监听实例 accountId：

```text
baseUrl: https://pay.muyuai.top
accountId: cmqq33ggv001h0ipboim7y0qq
token: 从 NovaPay 通道详情复制，不硬编码进 APK
channelCode: ctf.alipay.monitor
```

也可以直接把完整账单上报地址粘贴到 App 第一项“完整上报地址”，App 会自动拆成 `baseUrl / accountId / token`：

```text
https://pay.muyuai.top/api/ctf/bill-capture/{accountId}/{token}
```

## 推荐实战方式

1. 启动 NovaPay Web：

```bash
cd /Users/chole/项目/NovaPay
npm run dev
```

2. 运行本 App
3. 用 Burp / Charles 对设备设代理
4. 在 App 中点击：
   - 启动 session
   - 模拟支付
   - 拉取账单 envelope
   - 回放第一条账单到 NovaPay
5. 再对这个 APK 做 Frida / Hook / 逆向训练

## 后续可扩展点

- 增加 TLS pinning 模拟，专门练 Frida bypass
- 增加本地 SQLite 账单缓存，专门练 DB 提取
- 增加 protobuf / gzip / AES 包裹层，专门练协议还原
- 增加 release 混淆与简单反调试，专门练 Android 逆向
