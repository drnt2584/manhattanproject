// PM2 process file — `pm2 start ecosystem.config.cjs`
module.exports = {
  apps: [
    {
      name: 'notify-api',
      cwd: './server',
      script: 'src/index.js',
      exec_mode: 'fork',
      instances: 1,                 // one process easily serves an admin dashboard; see docs/ARCHITECTURE.md → Scaling
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      kill_timeout: 10000,
      out_file: '/usr/local/var/log/notify/api.out.log',
      error_file: '/usr/local/var/log/notify/api.err.log',
    },
    {
      name: 'notify-worker',
      cwd: './server',
      script: 'src/worker.js',
      instances: 1,                 // one sender is enough; more are safe (SKIP LOCKED) but not needed
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      kill_timeout: 30000,          // let an in-flight send finish
      out_file: '/usr/local/var/log/notify/worker.out.log',
      error_file: '/usr/local/var/log/notify/worker.err.log',
    },
  ],
};
