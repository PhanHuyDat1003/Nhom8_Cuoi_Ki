
let gameHasStarted = false;
var board = null
var game = new Chess()
var $status = $('#status')
var $pgn = $('#pgn')
let gameOver = false;

// Rematch variables
let rematchRequested = false;
let rematchReady = false;

// Game end tracking
let gameEndMessageSent = false;

// Chat variables
// playerName is now set from the server template
let typingTimeout = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Chat elements
const $chatMessages = $('#chatMessages');
const $chatInput = $('#chatInput');
const $sendBtn = $('#sendBtn');
const $typingIndicator = $('#typingIndicator');
const $chatStatus = $('#chatStatus');

// Initialize chat
function initChat() {
    // Send message on button click
    $sendBtn.on('click', sendMessage);

    // Send message on Enter key
    $chatInput.on('keypress', function (e) {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Typing indicator
    $chatInput.on('input', function () {
        if (typingTimeout) clearTimeout(typingTimeout);
        socket.emit('typing', true);

        typingTimeout = setTimeout(() => {
            socket.emit('typing', false);
        }, 1000);
    });

    // Socket events for chat
    socket.on('chatMessage', function (message) {
        addMessage(message);
    });

    socket.on('chatHistory', function (messages) {
        messages.forEach(msg => addMessage(msg));
    });

    socket.on('userTyping', function (data) {
        if (data.isTyping) {
            $typingIndicator.text(`${data.user} đang nhập tin nhắn...`).show();
        } else {
            $typingIndicator.hide();
        }
    });

    // Error handling
    socket.on('chatError', function (data) {
        addMessage({
            type: 'system',
            content: `❌ ${data.message}`,
            timestamp: new Date().toISOString()
        });
    });

    // Update chat status
    socket.on('connect', function () {
        $chatStatus.text('Đã kết nối').css('color', '#27ae60');
        $('#statusDot').removeClass('disconnected');
        reconnectAttempts = 0;
        console.log('Socket connected');
    });

    socket.on('disconnect', function () {
        $chatStatus.text('Mất kết nối').css('color', '#e74c3c');
        $('#statusDot').addClass('disconnected');
        console.log('Socket disconnected');

        // Auto reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
                socket.connect();
            }, 2000 * reconnectAttempts); // Exponential backoff
        } else {
            addMessage({
                type: 'system',
                content: '❌ Không thể kết nối lại. Vui lòng tải lại trang.',
                timestamp: new Date().toISOString()
            });
        }
    });

    socket.on('connect_error', function (error) {
        console.error('Connection error:', error);
        $chatStatus.text('Lỗi kết nối').css('color', '#e74c3c');
        $('#statusDot').addClass('disconnected');
    });

    // Ping/Pong để giữ kết nối
    setInterval(() => {
        if (socket.connected) {
            socket.emit('ping');
        }
    }, 30000); // Ping mỗi 30 giây
}

// Send message function
function sendMessage() {
    const content = $chatInput.val().trim();
    if (!content) return;

    if (!socket.connected) {
        addMessage({
            type: 'system',
            content: '❌ Không có kết nối. Vui lòng thử lại.',
            timestamp: new Date().toISOString()
        });
        return;
    }

    socket.emit('sendMessage', { content: content });
    $chatInput.val('');
    $sendBtn.prop('disabled', true);

    // Re-enable button after a short delay
    setTimeout(() => {
        $sendBtn.prop('disabled', false);
    }, 1000);
}

// Add message to chat
function addMessage(message) {
    const messageElement = $('<div>').addClass('message');
    const contentElement = $('<div>').addClass('message-content');
    const timeElement = $('<div>').addClass('message-time');

    if (message.type === 'system') {
        messageElement.addClass('system-message');
        contentElement.text(message.content);
        messageElement.append(contentElement);
    } else {
        const isOwnMessage = message.sender === playerName;
        messageElement.addClass(isOwnMessage ? 'own' : 'other');

        contentElement.text(message.content);
        timeElement.text(formatTime(message.timestamp));

        messageElement.append(contentElement);
        messageElement.append(timeElement);
    }

    $chatMessages.append(messageElement);
    scrollToBottom();
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Scroll to bottom of chat
function scrollToBottom() {
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

function onDragStart(source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false
    if (!gameHasStarted) return false;
    if (gameOver) return false;

    if ((playerColor === 'black' && piece.search(/^w/) !== -1) || (playerColor === 'white' && piece.search(/^b/) !== -1)) {
        return false;
    }

    // only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false
    }
}

function onDrop(source, target) {
    let theMove = {
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for simplicity
    };
    // see if the move is legal
    var move = game.move(theMove);

    // illegal move
    if (move === null) return 'snapback'

    socket.emit('move', theMove);

    updateStatus()
}

socket.on('newMove', function (move) {
    game.move(move);
    board.position(game.fen());
    updateStatus();
});

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd() {
    board.position(game.fen())
}

function updateStatus() {
    var status = ''

    var moveColor = 'White'
    if (game.turn() === 'b') {
        moveColor = 'Black'
    }

    // checkmate?
    if (game.in_checkmate()) {
        // Người thắng là người KHÔNG đến lượt đi (người đã thực hiện nước đi checkmate)
        var winnerColor = game.turn() === 'w' ? 'Black' : 'White';
        status = 'Game over, ' + winnerColor + ' wins by checkmate.'

        console.log('Checkmate detected:');
        console.log('- Current turn:', game.turn());
        console.log('- Winner:', winnerColor);
        console.log('- Game FEN:', game.fen());
        console.log('- Game end message sent:', gameEndMessageSent);

        // Add game over message to chat (chỉ gửi một lần)
        if (!gameEndMessageSent) {
            addMessage({
                type: 'system',
                content: `🎉 ${winnerColor === 'White' ? 'Trắng' : 'Đen'} thắng! Game kết thúc!`,
                timestamp: new Date().toISOString()
            });
            gameEndMessageSent = true;
        }
        showRematchSection();
    }

    // draw?
    else if (game.in_draw()) {
        status = 'Game over, drawn position'
        if (!gameEndMessageSent) {
            addMessage({
                type: 'system',
                content: '🤝 Hòa! Game kết thúc!',
                timestamp: new Date().toISOString()
            });
            gameEndMessageSent = true;
        }
        showRematchSection();
    }

    else if (gameOver) {
        status = 'Opponent disconnected, you win!'
        if (!gameEndMessageSent) {
            addMessage({
                type: 'system',
                content: '🏆 Đối thủ đã rời game. Bạn thắng!',
                timestamp: new Date().toISOString()
            });
            gameEndMessageSent = true;
        }
        showRematchSection();
    }

    else if (!gameHasStarted) {
        status = 'Waiting for black to join'
    }

    // game still on
    else {
        status = moveColor + ' to move'

        // check?
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check'
        }

    }

    $status.html(status)
    $pgn.html(game.pgn())
}

var config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme: '/public/img/chesspieces/wikipedia/{piece}.png'
}
if (!board) {
    board = Chessboard('myBoard', config);
    if (playerColor === 'black')
        board.flip();
}

updateStatus()

var urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('code')) {
    socket.emit('joinGame', {
        code: urlParams.get('code'),
        playerName: playerName,
        color: playerColor
    });
}

socket.on('startGame', function () {
    console.log('Game started - resetting game state...');

    // Reset game state khi bắt đầu game mới
    game = new Chess();
    board.position(game.fen());

    gameHasStarted = true;
    gameOver = false;
    gameEndMessageSent = false; // Reset game end message flag
    hideRematchSection(); // Ẩn rematch section khi game bắt đầu

    // Clear PGN and status
    $('#pgn').html('');
    $('#status').html('White to move');

    updateStatus();
    addMessage({
        type: 'system',
        content: '🎮 Game bắt đầu! Chúc may mắn!',
        timestamp: new Date().toISOString()
    });
});

socket.on('gameOverDisconnect', function () {
    gameOver = true;
    hideRematchSection(); // Ẩn rematch section khi đối thủ rời game
    updateStatus();
});

// Rematch functions
function showRematchSection() {
    console.log('Showing rematch section');
    console.log('- Game over:', gameOver);
    console.log('- Game has started:', gameHasStarted);
    console.log('- Game in checkmate:', game.in_checkmate());
    console.log('- Game in draw:', game.in_draw());

    $('#rematchSection').removeClass('hidden');
    $('#requestRematchBtn').show();
    $('#acceptRematchBtn').hide();
    $('#declineRematchBtn').hide();
    $('#rematchStatus').text('');
    console.log('Rematch section shown successfully');
}

function hideRematchSection() {
    $('#rematchSection').addClass('hidden');
    rematchRequested = false;
    rematchReady = false;
}

function requestRematch() {
    if (!socket.connected) {
        addMessage({
            type: 'system',
            content: '❌ Không có kết nối. Vui lòng thử lại.',
            timestamp: new Date().toISOString()
        });
        return;
    }

    socket.emit('requestRematch');
    $('#requestRematchBtn').prop('disabled', true).text('Đã yêu cầu...');
    rematchRequested = true;
    $('#rematchStatus').text('Đã gửi yêu cầu chơi lại...');
}

function acceptRematch() {
    console.log('Accept rematch clicked');

    if (!socket.connected) {
        console.log('Socket not connected');
        addMessage({
            type: 'system',
            content: '❌ Không có kết nối. Vui lòng thử lại.',
            timestamp: new Date().toISOString()
        });
        return;
    }

    console.log('Emitting acceptRematch event');
    socket.emit('acceptRematch');
    $('#acceptRematchBtn').prop('disabled', true).text('Đã đồng ý...');
    $('#declineRematchBtn').prop('disabled', true);
    $('#rematchStatus').text('Đã đồng ý chơi lại...');
    console.log('Accept rematch UI updated');
}

function declineRematch() {
    if (!socket.connected) {
        addMessage({
            type: 'system',
            content: '❌ Không có kết nối. Vui lòng thử lại.',
            timestamp: new Date().toISOString()
        });
        return;
    }

    socket.emit('declineRematch');
    $('#acceptRematchBtn').prop('disabled', true);
    $('#declineRematchBtn').prop('disabled', true).text('Đã từ chối...');
    $('#rematchStatus').text('Đã từ chối chơi lại.');
}

function resetGame() {
    console.log('Starting game reset...');

    // Reset game state
    game = new Chess();

    // Reset board position
    board.position(game.fen());

    // Reset game flags
    gameHasStarted = true;
    gameOver = false;
    rematchRequested = false;
    rematchReady = false;
    gameEndMessageSent = false; // Reset game end message flag

    // Reset button states
    $('#requestRematchBtn').prop('disabled', false).text('Yêu cầu chơi lại');
    $('#acceptRematchBtn').prop('disabled', false).text('Đồng ý');
    $('#declineRematchBtn').prop('disabled', false).text('Từ chối');

    // Hide rematch section
    hideRematchSection();

    // Clear PGN and status
    $('#pgn').html('');
    $('#status').html('White to move');

    // Update status
    updateStatus();

    // Add success message
    addMessage({
        type: 'system',
        content: '🎮 Game mới đã bắt đầu! Chúc may mắn!',
        timestamp: new Date().toISOString()
    });

    console.log('Game reset successfully - FEN:', game.fen());
}

// Rematch event listeners
socket.on('rematchRequested', function (data) {
    console.log('Rematch requested by:', data.playerName, 'Player ID:', data.playerId);
    if (data.playerId !== socket.id) {
        // Người chơi khác đã yêu cầu rematch
        $('#rematchSection').removeClass('hidden');
        $('#requestRematchBtn').hide();
        $('#acceptRematchBtn').show();
        $('#declineRematchBtn').show();
        $('#rematchStatus').text(`${data.playerName} muốn chơi lại. Bạn có muốn chơi lại không?`);
        console.log('Showing accept/decline buttons for rematch');
    }
});

socket.on('rematchReady', function () {
    console.log('Rematch ready event received');
    rematchReady = true;
    $('#rematchStatus').text('Có người muốn chơi lại!');
});

socket.on('rematchAccepted', function () {
    console.log('Rematch accepted - resetting game...');
    // Reset game và bắt đầu game mới
    resetGame();
});

socket.on('resetBoard', function (data) {
    console.log('Reset board event received:', data);

    try {
        // Reset board position từ server
        if (data && data.fen) {
            game = new Chess(data.fen);
            board.position(data.fen);
            console.log('Board reset from server - FEN:', data.fen);
        } else {
            // Fallback: reset to starting position
            game = new Chess();
            board.position(game.fen());
            console.log('Board reset to starting position');
        }

        // Reset game flags
        gameHasStarted = true;
        gameOver = false;
        rematchRequested = false;
        rematchReady = false;

        // Update status
        updateStatus();

        console.log('Board reset completed successfully');
    } catch (error) {
        console.error('Error resetting board:', error);
        // Fallback reset
        game = new Chess();
        board.position(game.fen());
        gameHasStarted = true;
        gameOver = false;
        updateStatus();
    }
});

socket.on('forceResetGame', function () {
    console.log('Force reset game event received');

    // Force reset game state
    game = new Chess();
    board.position(game.fen());

    // Reset all flags
    gameHasStarted = true;
    gameOver = false;
    rematchRequested = false;
    rematchReady = false;
    gameEndMessageSent = false; // Reset game end message flag

    // Reset UI
    hideRematchSection();
    $('#pgn').html('');
    $('#status').html('White to move');

    // Update status
    updateStatus();

    console.log('Force reset completed - FEN:', game.fen());
});

socket.on('rematchDeclined', function (data) {
    if (data.playerId !== socket.id) {
        // Người chơi khác đã từ chối
        $('#rematchStatus').text(`${data.playerName} đã từ chối chơi lại.`);
        $('#acceptRematchBtn').prop('disabled', true);
        $('#declineRematchBtn').prop('disabled', true);

        // Reset sau 3 giây
        setTimeout(() => {
            hideRematchSection();
        }, 3000);
    }
});

// Initialize chat when document is ready
$(document).ready(function () {
    initChat();

    // Initialize rematch buttons
    $('#requestRematchBtn').on('click', requestRematch);
    $('#acceptRematchBtn').on('click', acceptRematch);
    $('#declineRematchBtn').on('click', declineRematch);

    // Display player info
    $('#playerNameDisplay').text(playerName);
    $('#playerColorDisplay').text(`Màu: ${playerColor === 'white' ? 'Trắng' : 'Đen'}`);

    // Add welcome message
    setTimeout(() => {
        addMessage({
            type: 'system',
            content: `Chào mừng ${playerName}! Bạn đang chơi với màu ${playerColor === 'white' ? 'trắng' : 'đen'}.`,
            timestamp: new Date().toISOString()
        });
    }, 1000);
});