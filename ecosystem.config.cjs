module.exports = {
  apps: [
    {
      name: "novapay-web",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "novapay-callbacks-worker",
      script: "npm",
      args: "run callbacks:worker",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "novapay-finance-worker",
      script: "npm",
      args: "run finance:worker",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "novapay-onchain-worker",
      script: "npm",
      args: "run onchain:worker",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
