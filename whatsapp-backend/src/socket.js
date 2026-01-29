const { Server } = require("socket.io");
let io;

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: { origin: "*", methods: ["GET", "POST"] }
        });
        io.on('connection', (socket) => {
            console.log('Client connected to socket:', socket.id);
            socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
        });
        return io;
    },
    emit: (event, data) => {
        if (io) io.emit(event, data);
    }
};
