package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/cors"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

type Client struct {
	ID       string
	RoomID   string
	Conn     *websocket.Conn
	Send     chan []byte
	Username string
}

type Room struct {
	ID      string
	Clients map[string]*Client
	mu      sync.RWMutex
}

type Hub struct {
	Rooms      map[string]*Room
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan *Message
	mu         sync.RWMutex
}

type Message struct {
	Type         string      `json:"type"`
	RoomID       string      `json:"roomId,omitempty"`
	UserID       string      `json:"userId,omitempty"`
	Username     string      `json:"username,omitempty"`
	TargetUserID string      `json:"targetUserId,omitempty"`
	Data         interface{} `json:"data,omitempty"`
}

func newHub() *Hub {
	return &Hub{
		Rooms:      make(map[string]*Room),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan *Message),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			room, exists := h.Rooms[client.RoomID]
			if !exists {
				room = &Room{
					ID:      client.RoomID,
					Clients: make(map[string]*Client),
				}
				h.Rooms[client.RoomID] = room
			}
			room.mu.Lock()
			room.Clients[client.ID] = client
			room.mu.Unlock()
			h.mu.Unlock()

			// 通知房间内其他用户有新用户加入
			h.broadcastToRoom(client.RoomID, &Message{
				Type:     "user-joined",
				UserID:   client.ID,
				Username: client.Username,
			}, client.ID)

			// 发送当前房间用户列表给新用户
			userList := h.getUserList(client.RoomID)
			userListMsg, _ := json.Marshal(&Message{
				Type: "user-list",
				Data: userList,
			})
			select {
			case client.Send <- userListMsg:
			default:
				close(client.Send)
			}

		case client := <-h.Unregister:
			h.mu.Lock()
			if room, exists := h.Rooms[client.RoomID]; exists {
				room.mu.Lock()
				if _, exists := room.Clients[client.ID]; exists {
					delete(room.Clients, client.ID)
					close(client.Send)

					// 如果房间为空，删除房间
					if len(room.Clients) == 0 {
						delete(h.Rooms, client.RoomID)
					} else {
						// 通知其他用户该用户离开
						h.broadcastToRoom(client.RoomID, &Message{
							Type:   "user-left",
							UserID: client.ID,
						}, "")
					}
				}
				room.mu.Unlock()
			}
			h.mu.Unlock()

		case message := <-h.Broadcast:
			h.broadcastToRoom(message.RoomID, message, message.UserID)
		}
	}
}

func (h *Hub) broadcastToRoom(roomID string, message *Message, excludeUserID string) {
	h.mu.RLock()
	room, exists := h.Rooms[roomID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	room.mu.RLock()
	// 如果指定了目标用户，只发送给目标用户
	if message.TargetUserID != "" {
		if client, exists := room.Clients[message.TargetUserID]; exists {
			select {
			case client.Send <- data:
			default:
				close(client.Send)
				delete(room.Clients, message.TargetUserID)
			}
		}
	} else {
		// 广播给除了发送者之外的所有用户
		for clientID, client := range room.Clients {
			if clientID != excludeUserID {
				select {
				case client.Send <- data:
				default:
					close(client.Send)
					delete(room.Clients, clientID)
				}
			}
		}
	}
	room.mu.RUnlock()
}

func (h *Hub) getUserList(roomID string) []map[string]string {
	h.mu.RLock()
	room, exists := h.Rooms[roomID]
	h.mu.RUnlock()

	if !exists {
		return []map[string]string{}
	}

	var users []map[string]string
	room.mu.RLock()
	for _, client := range room.Clients {
		users = append(users, map[string]string{
			"id":       client.ID,
			"username": client.Username,
		})
	}
	room.mu.RUnlock()
	return users
}

func (c *Client) writePump() {
	defer c.Conn.Close()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.Conn.WriteMessage(websocket.TextMessage, message)
		}
	}
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			continue
		}

		message.UserID = c.ID
		message.RoomID = c.RoomID

		switch message.Type {
		case "offer", "answer", "ice-candidate":
			hub.Broadcast <- &message
		}
	}
}

func serveWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	log.Printf("🔗 收到WebSocket连接请求: %s", r.URL.String())

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ WebSocket升级失败: %v", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	roomID := r.URL.Query().Get("roomId")
	username := r.URL.Query().Get("username")

	log.Printf("🔗 连接参数: userID=%s, roomID=%s, username=%s", userID, roomID, username)

	if userID == "" || roomID == "" || username == "" {
		log.Printf("❌ 参数缺失，关闭连接: userID=%s, roomID=%s, username=%s", userID, roomID, username)
		conn.Close()
		return
	}

	log.Printf("✅ 创建客户端: userID=%s, roomID=%s, username=%s", userID, roomID, username)

	client := &Client{
		ID:       userID,
		RoomID:   roomID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Username: username,
	}

	hub.Register <- client

	go client.writePump()
	go client.readPump(hub)
}

func main() {
	hub := newHub()
	go hub.run()

	router := mux.NewRouter()

	// 配置CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"https://localhost:3000", "https://192.168.5.27:3000"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	// WebSocket路由
	router.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})

	// 健康检查路由
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	handler := c.Handler(router)

	// 同时启动HTTP和HTTPS服务器
	go func() {
		log.Printf("🚀 HTTP服务器启动在 http://localhost:8080")
		if err := http.ListenAndServe(":8080", handler); err != nil {
			log.Printf("HTTP服务器错误: %v", err)
		}
	}()

	log.Printf("🔒 HTTPS服务器启动在 https://localhost:8443")
	if err := http.ListenAndServeTLS(":8443", "localhost+1.pem", "localhost+1-key.pem", handler); err != nil {
		log.Fatal("HTTPS服务器错误:", err)
	}
}
