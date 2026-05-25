module.exports = {
  apps: [{
    name: 'turtle',
    script: 'server.js',
    cwd: '/opt/turtle',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/turtle/error.log',
    out_file: '/var/log/turtle/out.log',
    merge_logs: true,
    time: true
  }]
};
