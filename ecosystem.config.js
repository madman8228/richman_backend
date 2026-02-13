module.exports = {
  apps: [
    {
      name: "richman-api",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      min_uptime: "10s",
      restart_delay: 3000,
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
        APP_MODE: "cloud",
        PORT: 3000,
        PUBLIC_DIR: "/mnt/d/06-project/RichMan/public"
      }
    }
  ]
};
