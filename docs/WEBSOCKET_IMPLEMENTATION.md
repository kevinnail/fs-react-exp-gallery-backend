# WebSocket Implementation for Real-Time Messaging

This document outlines the WebSocket.IO implementation for real-time messaging in the Stress Less Glass gallery admin app.

## Overview

The implementation adds real-time messaging capabilities using Socket.IO, allowing instant message delivery, typing indicators, and connection status updates.

## Files Added/Modified

### New Files

- `src/services/websocket.js` - WebSocket service singleton
- `src/hooks/useWebSocket.js` - React hooks for WebSocket functionality
- `WEBSOCKET_IMPLEMENTATION.md` - This documentation

### Modified Files

- `src/components/Messages/Messages.js` - Updated to use WebSocket
- `src/components/Messages/Messages.css` - Added typing indicator styles
- `src/components/AdminInbox/AdminInbox.js` - Updated to use WebSocket
- `src/components/AdminInbox/AdminInbox.css` - Added typing indicator styles
- `package.json` - Added socket.io-client dependency

## Features Implemented

### 1. Real-Time Messaging

- Messages are sent and received instantly via WebSocket
- Fallback to REST API for reliability
- Automatic reconnection on connection loss

### 2. Typing Indicators

- Shows when someone is typing
- Automatic timeout after 1 second of inactivity
- Visual feedback with animated indicators

### 3. Connection Status

- Shows connection status to users
- Handles connection/disconnection gracefully
- Visual indicators for connection state

### 4. Room Management

- Users join conversation rooms for targeted messaging
- Automatic room joining/leaving
- Conversation-specific real-time updates

## WebSocket Service (`src/services/websocket.js`)

### Key Features

- Singleton pattern for global WebSocket management
- Event listener management
- Connection state tracking
- Room management (join/leave conversations)
- Message sending and receiving

### Methods

- `connect()` - Initialize WebSocket connection
- `disconnect()` - Close WebSocket connection
- `joinConversation(conversationId)` - Join a conversation room
- `leaveConversation(conversationId)` - Leave a conversation room
- `sendMessage(messageData)` - Send a message via WebSocket
- `markMessageAsRead(messageId)` - Mark message as read
- `sendTyping(conversationId, isTyping)` - Send typing indicator
- `on(event, callback)` - Add event listener
- `off(event, callback)` - Remove event listener

## React Hooks (`src/hooks/useWebSocket.js`)

### `useWebSocket()`

Basic WebSocket hook providing:

- Connection status
- Socket ID
- Event listener management
- WebSocket service methods

### `useMessaging()`

Specialized hook for messaging functionality:

- Message state management
- Conversation state management
- Typing indicators
- Real-time message updates

## Event System

### Client → Server Events

- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a new message
- `mark_message_read` - Mark message as read
- `typing` - Send typing indicator

### Server → Client Events

- `new_message` - New message received
- `message_read` - Message marked as read
- `conversation_updated` - Conversation metadata updated
- `typing_start` - User started typing
- `typing_stop` - User stopped typing

## Integration with Existing Components

### Messages Component

- Uses `useMessaging()` hook for real-time functionality
- Maintains existing REST API calls for reliability
- Adds typing indicators and connection status
- Real-time message updates

### AdminInbox Component

- Uses `useMessaging()` hook for real-time functionality
- Real-time conversation updates
- Typing indicators for customer messages
- Connection status display

## Styling

### Typing Indicator

```css
.typing-indicator {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  margin-bottom: 0.5rem;
  color: #ffd700;
  font-style: italic;
  animation: pulse 1.5s ease-in-out infinite;
}
```

### Connection Status

```css
.connection-status {
  background: rgba(255, 193, 7, 0.2);
  border: 1px solid rgba(255, 193, 7, 0.4);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  margin-bottom: 0.5rem;
  color: #ffc107;
}
```

## Backend Requirements

The backend needs to implement Socket.IO server with the following events:

### Server Events to Implement

1. **Connection handling**
   - Authenticate users on connection
   - Manage user sessions
   - Handle disconnections

2. **Room management**
   - `join_conversation` - Add user to conversation room
   - `leave_conversation` - Remove user from conversation room

3. **Message handling**
   - `send_message` - Process and broadcast new messages
   - `mark_message_read` - Update message read status

4. **Typing indicators**
   - `typing` - Broadcast typing status to room

### Example Backend Implementation (Node.js/Express)

```javascript
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  // Authenticate user
  socket.on('join_conversation', (data) => {
    socket.join(`conversation_${data.conversationId}`);
  });

  socket.on('leave_conversation', (data) => {
    socket.leave(`conversation_${data.conversationId}`);
  });

  socket.on('send_message', (data) => {
    // Save message to database
    // Broadcast to conversation room
    socket.to(`conversation_${data.conversationId}`).emit('new_message', message);
  });

  socket.on('typing', (data) => {
    socket.to(`conversation_${data.conversationId}`).emit('typing_start', {
      userId: socket.userId,
      conversationId: data.conversationId,
    });
  });
});
```

## Testing

### Manual Testing

1. Open two browser windows (user and admin)
2. Send messages between them
3. Verify real-time delivery
4. Test typing indicators
5. Test connection status

### Automated Testing

- Unit tests for WebSocket service
- Integration tests for hooks
- E2E tests for real-time messaging

## Error Handling

- Connection failures gracefully fall back to REST API
- Automatic reconnection attempts
- User-friendly error messages
- Connection status indicators

## Performance Considerations

- Efficient event listener management
- Automatic cleanup on component unmount
- Debounced typing indicators
- Optimized message broadcasting

## Security Considerations

- User authentication on WebSocket connection
- Room-based access control
- Message validation
- Rate limiting for typing indicators

## Future Enhancements

- Message delivery receipts
- Online/offline status
- Message reactions
- File sharing via WebSocket
- Push notifications
- Message encryption
