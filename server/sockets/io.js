

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

        // Rematch events
        socket.on('requestRematch', function() {
            try {
                if (!currentCode || !games[currentCode]) {
                    console.log('Invalid game code or game not found');
                    return;
                }
                
                // Tìm người chơi hiện tại
                const currentPlayer = games[currentCode].players.find(p => p.id === socket.id);
                if (!currentPlayer) {
                    console.log('Player not found in game');
                    return;
                }
                
                // Khởi tạo rematch state nếu chưa có
                if (!games[currentCode].rematch) {
                    games[currentCode].rematch = {
                        requests: [],
                        agreed: []
                    };
                }
                
                // Thêm yêu cầu rematch
                if (!games[currentCode].rematch.requests.includes(socket.id)) {
                    games[currentCode].rematch.requests.push(socket.id);
                    
                    // Thông báo cho tất cả người chơi
                    io.to(currentCode).emit('chatMessage', {
                        type: 'system',
                        content: `${currentPlayer.name} muốn chơi lại!`,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Gửi thông báo rematch request
                    io.to(currentCode).emit('rematchRequested', {
                        playerId: socket.id,
                        playerName: currentPlayer.name
                    });
                    
                    // Kiểm tra nếu có người yêu cầu rematch
                    if (games[currentCode].rematch.requests.length >= 1) {
                        io.to(currentCode).emit('rematchReady');
                    }
                    
                    console.log(`Rematch requested by ${currentPlayer.name}. Total requests: ${games[currentCode].rematch.requests.length}`);
                }
            } catch (error) {
                console.error('Error in requestRematch event:', error);
            }
        });

        socket.on('acceptRematch', function() {
            try {
                if (!currentCode || !games[currentCode]) {
                    console.log('Invalid game code or game not found');
                    return;
                }
                
                // Tìm người chơi hiện tại
                const currentPlayer = games[currentCode].players.find(p => p.id === socket.id);
                if (!currentPlayer) {
                    console.log('Player not found in game');
                    return;
                }
                
                // Khởi tạo rematch state nếu chưa có
                if (!games[currentCode].rematch) {
                    games[currentCode].rematch = {
                        requests: [],
                        agreed: []
                    };
                }
                
                // Thêm vào danh sách đồng ý
                if (!games[currentCode].rematch.agreed.includes(socket.id)) {
                    games[currentCode].rematch.agreed.push(socket.id);
                    
                    // Thông báo cho tất cả người chơi
                    io.to(currentCode).emit('chatMessage', {
                        type: 'system',
                        content: `${currentPlayer.name} đồng ý chơi lại!`,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`Player ${currentPlayer.name} accepted rematch. Agreed: ${games[currentCode].rematch.agreed.length}, Total players: ${games[currentCode].players.length}`);
                    
                    // Kiểm tra nếu có ít nhất 1 người yêu cầu và 1 người đồng ý
                    if (games[currentCode].rematch.requests.length >= 1 && games[currentCode].rematch.agreed.length >= 1) {
                        console.log('Rematch conditions met - starting new game...');
                        
                        // Reset game state
                        games[currentCode].gameState = {
                            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                            pgn: '',
                            gameOver: false
                        };
                        
                        // Reset rematch state
                        games[currentCode].rematch = {
                            requests: [],
                            agreed: []
                        };
                        
                        // Thông báo bắt đầu game mới
                        io.to(currentCode).emit('chatMessage', {
                            type: 'system',
                            content: '🎮 Game mới bắt đầu! Chúc may mắn!',
                            timestamp: new Date().toISOString()
                        });
                        
                        // Gửi event reset game cho tất cả người chơi
                        io.to(currentCode).emit('rematchAccepted');
                        
                        // Gửi thêm event để reset board position
                        io.to(currentCode).emit('resetBoard', {
                            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
                        });
                        
                        // Force reset game state cho tất cả người chơi
                        io.to(currentCode).emit('forceResetGame');
                        
                        console.log('Rematch events sent successfully');
                    }
                }
            } catch (error) {
                console.error('Error in acceptRematch event:', error);
            }
        });

        socket.on('declineRematch', function() {
            try {
                if (!currentCode || !games[currentCode]) {
                    console.log('Invalid game code or game not found');
                    return;
                }
                
                // Tìm người chơi hiện tại
                const currentPlayer = games[currentCode].players.find(p => p.id === socket.id);
                if (!currentPlayer) {
                    console.log('Player not found in game');
                    return;
                }
                
                // Reset rematch state
                if (games[currentCode].rematch) {
                    games[currentCode].rematch = {
                        requests: [],
                        agreed: []
                    };
                }
                
                // Thông báo từ chối rematch
                io.to(currentCode).emit('chatMessage', {
                    type: 'system',
                    content: `${currentPlayer.name} từ chối chơi lại.`,
                    timestamp: new Date().toISOString()
                });
                
                io.to(currentCode).emit('rematchDeclined', {
                    playerId: socket.id,
                    playerName: currentPlayer.name
                });
            } catch (error) {
                console.error('Error in declineRematch event:', error);
            }
        });

        socket.on('disconnect', function() {
            console.log('socket disconnected:', socket.id);

            try {
                if (currentCode && games[currentCode]) {
                    // Xóa người chơi khỏi danh sách
                    games[currentCode].players = games[currentCode].players.filter(p => p.id !== socket.id);
                    
                    // Reset rematch state nếu có
                    if (games[currentCode].rematch) {
                        games[currentCode].rematch = {
                            requests: [],
                            agreed: []
                        };
                    }
                    
                    // Thông báo người chơi rời game
                    io.to(currentCode).emit('chatMessage', {
                        type: 'system',
                        content: `${playerName || 'Unknown'} đã rời game.`,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Nếu không còn ai trong phòng, xóa phòng
                    if (games[currentCode].players.length === 0) {
                        delete games[currentCode];
                        console.log(`Game room ${currentCode} deleted`);
                    } else {
                        io.to(currentCode).emit('gameOverDisconnect');
                    }
                }
            } catch (error) {
                console.error('Error in disconnect event:', error);
            }
        });

        // Error handling
        socket.on('error', function(error) {
            console.error('Socket error:', error);
        });

    });
};