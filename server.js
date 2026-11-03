import app from './src/app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const server = app.listen(port, () => console.log(`FORME AI styling server: http://localhost:${port}`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set another PORT in .env.` : 'Unable to start the server.');
  process.exitCode = 1;
});
