const { io } = require('socket.io-client');

const token = process.argv[2];
const channelId = process.argv[3];
if (!token || !channelId) {
  console.log('Usage: node test/wsClient.cjs <JWT> <CHANNEL_ID>');
  process.exit(1);
}

const socket = io('http://localhost:3000', { auth: { token } });
socket.on('connect', () => {
  console.log('connected as', socket.id);
  socket.emit('channel:subscribe', { channelId });
});

socket.on('message:new', (msg) => {
  console.log('NEW MESSAGE:', msg.user_id, '>', msg.content);
});

socket.on('connected', () => console.log('socket hello'));
socket.on('disconnect', () => console.log('bye'));
