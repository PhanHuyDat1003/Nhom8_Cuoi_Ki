

module.exports = io => {
    io.on('connection', socket => {
        console.log('New socket connection');

        let currentCode = null;
        let playerName = null;
        let playerColor = null;

        socket.on('move', function(move) {
            console.log('move detected')
            try {
                // Lưu game state nếu chưa có
                if (!games[currentCode].gameState) {
                    games[currentCode].gameState = {
                        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                        pgn: '',
                        gameOver: false
                    };
                }
                
                io.to(currentCode).emit('newMove', move);
            } catch (error) {
                console.error('Error in move event:', error);
            }
        });
        
        socket.on('joinGame', function(data) {
            try {
                currentCode = data.code;
                playerName = data.playerName || `Player_${Math.random().toString(36).substr(2, 5)}`;
                playerColor = data.color || 'white'; // Thêm playerColor
                socket.join(currentCode);
                
                if (!games[currentCode]) {
                    games[currentCode] = {
                        players: [],
                        messages: [],
                        gameState: {
                            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                            pgn: '',
                            gameOver: false
                        }
                    };
                    games[currentCode].players.push({
                        id: socket.id,
                        name: playerName,
                        color: 'white'
                    });
                    playerColor = 'white';
                    return;
                }
                
                // Thêm người chơi thứ 2
                if (games[currentCode].players.length < 2) {
                    games[currentCode].players.push({
                        id: socket.id,
                        name: playerName,
                        color: 'black'
                    });
                    playerColor = 'black';
                    
                    // Gửi lịch sử chat cho người chơi mới
                    socket.emit('chatHistory', games[currentCode].messages);
                    
                    // Đảm bảo game state được khởi tạo đúng
                    if (!games[currentCode].gameState) {
                        games[currentCode].gameState = {
                            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                            pgn: '',
                            gameOver: false
                        };
                    }
                    
                    io.to(currentCode).emit('startGame');
                    io.to(currentCode).emit('chatMessage', {
                        type: 'system',
                        content: `${playerName} đã tham gia game!`,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Error in joinGame event:', error);
            }
        });

        // Chat events
        socket.on('sendMessage', function(data) {
            try {
                if (!currentCode || !games[currentCode]) {
                    console.log('Invalid game code or game not found');
                    return;
                }
                
                if (!data.content || data.content.trim().length === 0) {
                    console.log('Empty message content');
                    return;
                }
                
                const message = {
                    id: Math.random().toString(36).substr(2, 9),
                    content: data.content.trim(),
                    sender: playerName || 'Unknown',
                    senderColor: playerColor || 'white',
                    timestamp: new Date().toISOString(),
                    type: 'user'
                };
                
                // Lưu tin nhắn vào lịch sử
                games[currentCode].messages.push(message);
                
                // Giới hạn số tin nhắn lưu trữ (tối đa 100 tin nhắn)
                if (games[currentCode].messages.length > 100) {
                    games[currentCode].messages = games[currentCode].messages.slice(-100);
                }
                
                // Gửi tin nhắn đến tất cả người chơi trong phòng
                io.to(currentCode).emit('chatMessage', message);
                
                console.log(`Message sent by ${playerName} in room ${currentCode}`);
            } catch (error) {
                console.error('Error in sendMessage event:', error);
                socket.emit('chatError', { message: 'Lỗi khi gửi tin nhắn' });
            }
        });

        socket.on('typing', function(isTyping) {
            try {
                if (!currentCode) return;
                socket.to(currentCode).emit('userTyping', {
                    user: playerName || 'Unknown',
                    isTyping: isTyping
                });
            } catch (error) {
                console.error('Error in typing event:', error);
            }
        });

        // Ping/Pong để giữ kết nối
        socket.on('ping', function() {
            socket.emit('pong');
        });

        

    });
};