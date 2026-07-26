import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async rewrites() {
    // 易支付协议端点:外部客户端硬编码 /submit.php /mapi.php /api.php,
    // Next 路由目录名不能含点,故用 rewrite 映射到内部 app/api/easypay/* 处理器。
    return {
      beforeFiles: [
        { source: "/submit.php", destination: "/api/easypay/submit" },
        { source: "/mapi.php", destination: "/api/easypay/mapi" },
        { source: "/api.php", destination: "/api/easypay/api" },
      ],
    };
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }

    return config;
  },
};

export default nextConfig;
