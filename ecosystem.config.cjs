module.exports = {
  apps: [{
    name: 'celestile',
    script: './node_modules/.bin/next',
    args: 'start',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '400M',
    max_restarts: 20,
    min_uptime: '5s',
    restart_delay: 1000,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
