# NovaPay CTF：真实设备 / 真实 App 抓包联调 Runbook

> 适用场景：授权沙箱 / 内网 / 合作测试环境中的真实 Android App（例如沙箱支付宝测试包），目标是把抓包 / Hook / 本地账单提取结果回放到 NovaPay 的 `ctf-bill-capture` 通道。

## 1. 目标

打通这条链路：

```text
真实设备 App -> 抓包 / Frida Hook / 本地库提取 -> 账单 JSON -> NovaPay /api/ctf/bill-capture/{accountId}/{token}
```

NovaPay 平台侧已经支持：

- `POST /api/ctf/bill-capture/{accountId}/{token}`
- 自动归一化字段别名
- 去重、匹配订单、自动入账

## 2. 你现在可直接使用的本地测试通道

当前本地实例已创建一条测试通道：

```text
channelCode: ctf.alipay.monitor
accountId: cmqopn8qs00017x9k3e3j8khd
token: mct_WikB32WWUoWvtJ_5hm6VQz27
captureUrl: http://localhost:3000/api/ctf/bill-capture/cmqopn8qs00017x9k3e3j8khd/mct_WikB32WWUoWvtJ_5hm6VQz27
```

如果是真机连同一 Wi‑Fi，`localhost` 要替换成你电脑局域网地址，例如：

```text
http://192.168.10.19:3000/api/ctf/bill-capture/cmqopn8qs00017x9k3e3j8khd/mct_WikB32WWUoWvtJ_5hm6VQz27
```

## 3. 优先抓什么

优先顺序：

1. **HTTP 出入口**：是否有账单接口 / 交易明细接口 / 列表接口
2. **JSON 模型层**：是否有 `tradeNo / totalAmount / gmtPayment / buyerLogonId / subject`
3. **SQLite 本地账单缓存**：App 是否把账单列表落到本地数据库
4. **WebView / JSBridge**：账单页如果是 H5，抓 JS bridge 和接口

目标最小字段：

```json
{
  "amount": "88.00",
  "paidAt": "2026-06-22T04:18:29.538Z",
  "externalBillId": "CTF_ALIPAY_BILL_xxx",
  "payerAccount": "buyer@example.test",
  "remark": "ORDER-20260622-001",
  "source": "frida-alipay-sandbox"
}
```

服务端兼容这些别名：

- 金额：`amount` / `money` / `totalAmount`
- 时间：`paidAt` / `payTime` / `gmtPayment` / `timestamp`
- 单号：`externalBillId` / `tradeNo` / `transactionId` / `orderNo`
- 付款人：`payerAccount` / `buyerLogonId` / `openid` / `nickname`
- 备注：`remark` / `memo` / `note` / `body` / `subject`

所以 **抓到原始账单 JSON 后通常不用先改字段，直接上报即可**。

## 4. 真实设备抓包步骤

### 4.1 设置代理

真机 / 模拟器 Wi‑Fi 代理指向你的 Burp / Charles / mitmproxy。

例如 Burp：

```text
Proxy host: 192.168.10.19
Proxy port: 8080
```

### 4.2 安装代理 CA

在测试设备安装 Burp / Charles CA。

### 4.3 若仍抓不到 HTTPS

通常是 TLS pinning / 自定义校验。

此时用 Frida：

```bash
frida -U -f com.eg.android.AlipayGphone -l scripts/frida/android-ctf-bill.js --no-pause
```

这个脚本已内置：

- `SSLContext.init` bypass
- `okhttp3.CertificatePinner.check` bypass
- `TrustManagerImpl.verifyChain` bypass
- OkHttp request / response 日志
- Gson / JSONObject 日志
- SQLite rawQuery 日志

## 5. Hook 结果怎么看

Frida 会持续输出：

- `http.request`
- `http.response`
- `json.object`
- `json.gson.fromJson`
- `sqlite.rawQuery`

优先找包含这些关键词的结果：

```text
bill
trade
order
amount
totalAmount
payTime
gmtPayment
buyerLogonId
remark
memo
subject
支付
账单
交易
金额
```

### 5.1 命中 HTTP 响应

如果在 `http.response` 中直接看到了账单 JSON，直接保存成文件，比如：

```text
artifacts/alipay-bill.json
```

### 5.2 命中本地数据库

如果 `sqlite.rawQuery` 命中了账单 SQL，继续补一层针对 Cursor / model 的定点 Hook；优先把 SQL 和表名先记下来。

### 5.3 命中 JSON 模型

如果 `json.object` / `json.gson.fromJson` 里已经有完整账单对象，那是最好的回放输入。

## 6. 把抓到的账单回放到 NovaPay

仓库里新增了一个 CLI：

```text
scripts/post-ctf-bill.ts
```

### 6.1 根对象就是账单 JSON

```bash
node --import tsx scripts/post-ctf-bill.ts \
  --url http://localhost:3000/api/ctf/bill-capture/cmqopn8qs00017x9k3e3j8khd/mct_WikB32WWUoWvtJ_5hm6VQz27 \
  --file artifacts/alipay-bill.json \
  --source frida-alipay-sandbox
```

### 6.2 抓到的是包裹对象，需要选路径

例如导出的 JSON 是：

```json
{
  "data": {
    "list": [
      { "tradeNo": "...", "totalAmount": "88.00" }
    ]
  }
}
```

则可这样投递：

```bash
node --import tsx scripts/post-ctf-bill.ts \
  --url http://localhost:3000/api/ctf/bill-capture/cmqopn8qs00017x9k3e3j8khd/mct_WikB32WWUoWvtJ_5hm6VQz27 \
  --file artifacts/export.json \
  --pick data.list.0 \
  --source frida-alipay-sandbox
```

### 6.3 覆盖 remark / channelCode

```bash
node --import tsx scripts/post-ctf-bill.ts \
  --url http://localhost:3000/api/ctf/bill-capture/cmqopn8qs00017x9k3e3j8khd/mct_WikB32WWUoWvtJ_5hm6VQz27 \
  --file artifacts/export.json \
  --pick data.list.0 \
  --source frida-alipay-sandbox \
  --channel-code ctf.alipay.monitor \
  --set remark=ORDER-20260622-001
```

## 7. 成功判定

成功返回示例：

```json
{
  "ok": true,
  "eventId": "cmqopq0xx0002779k11xuir03",
  "duplicate": false,
  "matched": true,
  "matchedPaymentOrderId": "cmqopn8r800037x9kn6hkff1r",
  "status": "MATCHED"
}
```

表示已经完成：

```text
真实 App 抓取 -> 账单抽取 -> NovaPay 入库 -> 订单匹配成功
```

## 8. 失败排查

### 8.1 返回 duplicate=true

说明同一条账单已经投过。

优先检查：

- `externalBillId`
- `paidAt`
- `amount`

### 8.2 返回 matched=false

说明账单已入库但未匹配到订单。

检查：

- 通道 URL 是否投对了实例
- `amount` 是否一致
- `channelCode` 是否一致
- `remark` 是否包含订单号 / 外部订单号 / subject
- `ctf-bill-capture-worker` 是否在跑

### 8.3 Burp 能看到 CONNECT，但看不到明文

说明仍有 pinning / 自定义信任链校验。

先用：

```bash
frida -U -f <target.package> -l scripts/frida/android-ctf-bill.js --no-pause
```

## 9. 推荐的实战路径

如果你现在就要冲一次完整链路，建议按这个顺序：

1. 真机连 Wi‑Fi + 设代理
2. 打开目标测试 App 的账单页 / 交易页
3. 抓不到明文就上 `scripts/frida/android-ctf-bill.js`
4. 先拿到一条完整账单 JSON
5. 存成 `artifacts/alipay-bill.json`
6. 用 `scripts/post-ctf-bill.ts` 投递到本地 capture URL
7. 观察 NovaPay 返回 `MATCHED`

## 10. 当前仓库里与此链路相关的文件

- `app/api/ctf/bill-capture/[accountId]/[token]/route.ts`
- `lib/ctf-bill-capture/service.ts`
- `scripts/ctf-bill-capture-worker.ts`
- `scripts/post-ctf-bill.ts`
- `scripts/frida/android-ctf-bill.js`
- `app/ctf/capture-lab/page.tsx`
